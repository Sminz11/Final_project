import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { filter, switchMap, map } from 'rxjs/operators';
import { of } from 'rxjs';

export const permissionGuard = (requiredPermission: string): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return auth.isLoading$.pipe(
      filter((loading) => !loading), // แก้กลับมาใช้ isLoading$ มี $
      switchMap(() => auth.user$),
      switchMap((user) => {
        if (!user) {
          alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
          return of(router.createUrlTree(['/dashboard']));
        }

        // แปลง Type เป็น any เพื่อป้องกัน Error 'Property email does not exist'
        const userObj = user as any;
        const email = userObj?.email?.toLowerCase() || '';

        if (requiredPermission === 'read:pending_requests' && email.includes('approver')) {
          return of(true);
        }
        if (requiredPermission === 'read:audit_logs' && email.includes('admin')) {
          return of(true);
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

              if (permissions.includes(requiredPermission)) {
                return true;
              }
            } catch (e) {}

            alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            return router.createUrlTree(['/dashboard']);
          })
        );
      })
    );
  };
};