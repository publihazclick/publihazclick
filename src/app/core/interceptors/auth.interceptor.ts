import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, throwError, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Interceptor HTTP que añade el token de autenticación a las peticiones
 * y maneja errores de autenticación
 * 
 * Uso en app.config.ts:
 * 
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideHttpClient(withInterceptors([authInterceptor]))
 *   ]
 * };
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Rutas que no requieren autenticación
  const publicUrls = [
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/refreshtoken'
  ];

  // Verificar si es una ruta pública
  const isPublicUrl = publicUrls.some(url => req.url.includes(url));

  // Si es una ruta pública, continuar sin modificar
  if (isPublicUrl) {
    return next(req);
  }

  // Obtener el token de acceso
  const accessToken = authService.getAccessToken();

  // Si hay un token, agregarlo a la cabecera
  let authReq = req;
  if (accessToken) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
        'apikey': environment.supabase.anonKey
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Manejar errores de autenticación
      if (error.status === 401) {
        // Token expirado o invalido - intentar refrescar
        return authService.refreshSession().pipe(
          catchError(() => {
            authService.logout();
            
            // Redirigir a login
            const loginUrl = environment.redirect?.logoutSuccess ?? '/login';
            router.navigate([loginUrl], {
              queryParams: { returnUrl: req.url }
            });
            
            return throwError(() => error);
          }),
          // Reintentar la petición original con el nuevo token
          switchMap((result) => {
            if (result.success && result.data) {
              const newToken = (result.data as any).access_token;
              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                  'apikey': environment.supabase.anonKey
                }
              });
              return next(retryReq);
            }
            return throwError(() => error);
          })
        );
      }

      if (error.status === 403) {
        router.navigate(['/unauthorized']);
      }

      return throwError(() => error);
    })
  );
};

/**
 * Interceptor que agrega el token solo a peticiones que van a la API de Supabase
 * Útil si tienes un backend propio además de Supabase
 */
export const supabaseApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);
  
  // Verificar si la petición es a Supabase
  if (req.url.includes('supabase.co')) {
    const accessToken = authService.getAccessToken();
    
    if (accessToken) {
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`,
          'apikey': environment.supabase.anonKey
        }
      });
      return next(authReq);
    }
  }
  
  return next(req);
};

/**
 * Interceptor para agregar headers de contenido JSON a las peticiones
 */
export const jsonContentInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  // No modificar si ya tiene Content-Type o es FormData
  if (req.body instanceof FormData) {
    return next(req);
  }

  const jsonReq = req.clone({
    setHeaders: {
      'Content-Type': 'application/json'
    }
  });

  return next(jsonReq);
};
