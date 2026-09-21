import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard/dashboard.component'; 
import { CreateRequestComponent } from './components/create-request/create-request.component';
import { ApproverDashboardComponent } from './components/approver-dashboard/approver-dashboard.component';
import { AdminAuditLogComponent } from './components/admin-audit-log/admin-audit-log.component';
import { permissionGuard } from './permission.guard';

export const initialRedirectGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoading$.pipe(
    filter((loading) => !loading), // แก้เป็น isLoading$ มี $
    switchMap(() => auth.user$),
    switchMap((user) => {
      if (!user) {
        return of(router.createUrlTree(['/dashboard']));
      }

      // แปลง Type เป็น any เพื่อดึง email ได้โดยไม่ติด Error
      const userObj = user as any;
      const email = userObj?.email?.toLowerCase() || '';

      if (email.includes('approver')) {
        return of(router.createUrlTree(['/approver-dashboard']));
      }
      if (email.includes('admin')) {
        return of(router.createUrlTree(['/admin-audit-log']));
      }

      return auth.getAccessTokenSilently().pipe(
        map((token) => {
          try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
              atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
            );

            const payload = JSON.parse(jsonPayload);
            const permissions: string[] = payload.permissions || [];

            if (permissions.includes('read:pending_requests')) {
              return router.createUrlTree(['/approver-dashboard']);
            }
            if (permissions.includes('read:audit_logs')) {
              return router.createUrlTree(['/admin-audit-log']);
            }

            return router.createUrlTree(['/dashboard']);
          } catch (e) {
            return router.createUrlTree(['/dashboard']);
          }
        }),
        catchError(() => of(router.createUrlTree(['/dashboard'])))
      );
    }),
    catchError(() => of(router.createUrlTree(['/dashboard'])))
  );
};

export const routes: Routes = [
  { 
    path: '', 
    canActivate: [initialRedirectGuard], 
    children: [] 
  },
  
  { path: 'dashboard', component: DashboardComponent },
  { path: 'create-request', component: CreateRequestComponent },
  
  { 
    path: 'approver-dashboard', 
    component: ApproverDashboardComponent, 
    canActivate: [permissionGuard('read:pending_requests')] 
  },
  { 
    path: 'admin-audit-log', 
    component: AdminAuditLogComponent, 
    canActivate: [permissionGuard('read:audit_logs')] 
  },
  
  { path: '**', redirectTo: '' }
];