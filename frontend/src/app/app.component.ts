import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, DOCUMENT } from '@angular/common';
import { AuthService } from '@auth0/auth0-angular';
import { filter, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  auth = inject(AuthService);
  document = inject(DOCUMENT);
  
  permissions: string[] = [];
  userEmail: string = '';

  ngOnInit(): void {
    // รวม Pipeline การจัดการ User & Permissions เมื่อ Auth0 โหลดเสร็จสิ้น
    this.auth.isLoading$.pipe(
      filter(loading => !loading), // รอจนกว่า Auth0 จะจัดการ Query Param (?code=...) เสร็จ
      switchMap(() => this.auth.isAuthenticated$)
    ).subscribe(isAuthenticated => {
      if (!isAuthenticated) {
        this.userEmail = '';
        this.permissions = [];
        return;
      }

      // 1. ดึงข้อมูล User Profile
      this.auth.user$.subscribe(user => {
        this.userEmail = user?.email?.toLowerCase() || '';
      });

      // 2. ดึง Access Token มา decode หา Permissions
      this.auth.getAccessTokenSilently().subscribe({
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
    });
  }

  // ตรวจสอบสิทธิ์โดยรองรับทั้ง Email Fallback และ JWT Token Permissions
  hasPermission(perm: string): boolean {
    if (perm === 'read:pending_requests' && this.userEmail.includes('approver')) {
      return true;
    }
    if ((perm === 'read:audit_logs' || perm === 'read:all_requests') && this.userEmail.includes('admin')) {
      return true;
    }

    return this.permissions.includes(perm);
  }

  // เมธอดสำหรับปุ่ม Login
  login(): void {
    this.auth.loginWithRedirect();
  }

  // เมธอดสำหรับปุ่ม Logout
  logout(): void {
    this.auth.logout({
      logoutParams: {
        returnTo: this.document.location.origin
      }
    });
  }
}