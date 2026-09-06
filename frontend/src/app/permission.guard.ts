import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { map, take } from 'rxjs/operators';

export const permissionGuard = (requiredPermission: string): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return auth.getAccessTokenSilently().pipe(
      take(1),
      map(token => {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const permissions: string[] = payload.permissions || [];

          if (permissions.includes(requiredPermission)) {
            return true;
          }
        } catch (e) {
          // ignore error
        }

        alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        router.navigate(['/dashboard']);
        return false;
      })
    );
  };
};