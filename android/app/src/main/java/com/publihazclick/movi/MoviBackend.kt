package com.publihazclick.movi

/**
 * Datos PUBLICOS del backend de Movi (proyecto Supabase hndhgtnjyjwrnzdcgcca) para las pocas
 * llamadas que hace el codigo nativo sin pasar por la app web. La llave es la anon/publica: la
 * misma que ya viaja en el JavaScript de www.publihazclick.com, no da acceso a nada que RLS no
 * permita. Hoy la usa solo la confirmacion de entrega del push (ag_push_recibido, migracion 303).
 */
object MoviBackend {
    const val SUPABASE_URL = "https://hndhgtnjyjwrnzdcgcca.supabase.co"
    const val ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuZGhndG5qeWp3cm56ZGNnY2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTQ5OTgsImV4cCI6MjA5ODc5MDk5OH0.Rg_3vQVTgn-0V7xpWILYVK32KHBRJTBUDX5K5bAvcq4"
}
