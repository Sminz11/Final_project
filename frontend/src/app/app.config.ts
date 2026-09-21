import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0, authHttpInterceptorFn } from '@auth0/auth0-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authHttpInterceptorFn])
    ),
    provideAuth0({
      domain: 'dev-if4shgdd8fo8fttw.us.auth0.com',
      clientId: 'tXw5allsx5GdR2FKyipCsPnbiiKBt4wI',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: 'https://intern-request-api',
        scope: 'openid profile email offline_access'
      },
      httpInterceptor: {
        allowedList: [
          {
            uri: 'http://localhost:8080/api/v1/*',
            tokenOptions: {
              authorizationParams: {
                audience: 'https://intern-request-api'
              }
            }
          }
        ]
      }
    })
  ]
};