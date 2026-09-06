import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule, DOCUMENT } from '@angular/common';
import { AuthService } from '@auth0/auth0-angular';
import { filter, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule],
  template: `
    <nav style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background-color: #ffffff; border-bottom: 1px solid #e2e8f0;">
      <!-- ด้านซ้าย: Logo + Navigation Links ตาม Permission/Role -->
      <div style="display: flex; align-items: center; gap: 1.5rem;">
        <span style="font-weight: bold; font-size: 1.2rem; color: #4f46e5;">PortalHub</span>
        
        <ng-container *ngIf="auth.user$ | async">
          <!-- แสดงเฉพาะ User ปกติ (ผู้ที่ไม่มีสิทธิ์ Approver และไม่มีสิทธิ์ Admin) -->
          <a *ngIf="!hasPermission('read:pending_requests') && !hasPermission('read:audit_logs')" 
             routerLink="/dashboard" 
             style="text-decoration: none; color: #334155;">
             คำขอของฉัน
          </a>
          
          <!-- แสดงเฉพาะ Approver -->
          <a *ngIf="hasPermission('read:pending_requests')" 
             routerLink="/approver-dashboard" 
             style="text-decoration: none; color: #334155;">
             รายการรออนุมัติ
          </a>
          
          <!-- แสดงเฉพาะ Admin -->
          <a *ngIf="hasPermission('read:audit_logs')" 
             routerLink="/admin-audit-log" 
             style="text-decoration: none; color: #334155;">
             Audit Logs
          </a>
        </ng-container>
      </div>

      <!-- ด้านขวา: User Profile & Auth Button -->
      <div style="display: flex; align-items: center; gap: 1rem;">
        <ng-container *ngIf="auth.user$ | async as user; else loggedOut">
          <div style="display: flex; align-items: center; gap: 0.75rem; background-color: #f1f5f9; padding: 0.4rem 0.8rem; border-radius: 9999px;">
            <span style="font-size: 0.875rem; font-weight: 500;">{{ user.email }}</span>
          </div>
          <button (click)="auth.logout({ logoutParams: { returnTo: document.location.origin } })"
            style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
            ออกจากระบบ
          </button>
        </ng-container>

        <ng-template #loggedOut>
          <button (click)="auth.loginWithRedirect()"
            style="padding: 0.5rem 1.2rem; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
            เข้าสู่ระบบ (Login)
          </button>
        </ng-template>
      </div>
    </nav>

    <router-outlet></router-outlet>
  `
})
export class AppComponent implements OnInit {
  auth = inject(AuthService);
  document = inject(DOCUMENT);
  permissions: string[] = [];

  ngOnInit() {
    this.auth.isAuthenticated$.pipe(
      filter(isAuth => isAuth),
      switchMap(() => this.auth.getAccessTokenSilently())
    ).subscribe({
      next: (token) => {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          
          const payload = JSON.parse(jsonPayload);
          this.permissions = payload.permissions || [];
        } catch (e) {
          this.permissions = [];
        }
      },
      error: () => {
        this.permissions = [];
      }
    });
  }

  hasPermission(perm: string): boolean {
    return this.permissions.includes(perm);
  }
}