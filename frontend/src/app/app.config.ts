import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0, authHttpInterceptorFn } from '@auth0/auth0-angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authHttpInterceptorFn])),
    provideAuth0({
      domain: 'dev-ludpyfaeksp25aae.us.auth0.com',
      clientId: 'eBucgTOLbomTJuiIjXJNHqP8kk24N0XC',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: 'https://intern-request-api'
      },
      httpInterceptor: {
        allowedList: [
          {
            // ใช้ Wildcard ครอบคลุมทุก Endpoint ใต้ /api/v1/
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