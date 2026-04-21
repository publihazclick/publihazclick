import { AuthService } from '../services/auth.service';

/**
 * Espera a que AuthService termine de cargar la sesión inicial.
 * Timeout de seguridad: 5 s (por si el storage/supabase no responde).
 *
 * Esto es CRÍTICO para que los guards no redirijan por error al recargar:
 * sin esperar, isAuthenticated() retorna false durante la rehidratación
 * asíncrona y cualquier ruta protegida manda al usuario a /login.
 */
export function awaitAuthLoaded(authService: AuthService): Promise<void> {
  if (!authService.isLoading()) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const subscription = authService.authStateObservable$.subscribe((authState) => {
      if (!authState.isLoading) {
        subscription.unsubscribe();
        resolve();
      }
    });

    setTimeout(() => {
      subscription.unsubscribe();
      resolve();
    }, 5000);
  });
}
