-- ═══════════════════════════════════════════════════════════════════════════
-- 227: CIUDAD A CIUDAD — Ubicación en vivo del conductor para el pasajero
-- ═══════════════════════════════════════════════════════════════════════════
-- Sigue cerrando brechas de la migración 226 (ver ese archivo para el resto):
-- el pasajero de un viaje Ciudad a Ciudad no tenía forma de ver dónde va el
-- conductor en tiempo real -- solo un botón para compartir SU PROPIA
-- ubicación, nada del lado del conductor. ag_driver_locations (tabla urbana)
-- ya se actualiza para CUALQUIER conductor en línea sin importar si el viaje
-- activo es urbano o intercity (updateDriverLocation() no distingue), así que
-- no hace falta tabla nueva -- solo resolver el id correcto para consultarla.
--
-- De paso corrige un bug real y pre-existente (migración 172, nunca causó
-- error porque el subquery simplemente no encontraba coincidencias): la vista
-- cc_request_detail_v comparaba ag_ratings.driver_id / ag_trips.driver_id
-- (que son el id de ag_drivers) contra r.driver_id (que es el auth uid) --
-- nunca podían coincidir, así que driver_rating/driver_trips siempre
-- devolvían NULL/0 para todo viaje Ciudad a Ciudad. Se resuelve el id de
-- ag_drivers UNA vez y se reusa para las 4 columnas.
--
-- Solo toca cc_request_detail_v, un objeto propio del módulo Ciudad a Ciudad
-- (migración 172) -- no se modifica ag_driver_locations ni ninguna otra
-- tabla/función urbana.
-- ═══════════════════════════════════════════════════════════════════════════

-- IMPORTANTE: CREATE OR REPLACE VIEW exige columnas existentes en el MISMO
-- nombre/tipo/orden. Como esta vista usa "r.*" y cc_requests ganó 6 columnas
-- nuevas al final en la migración 226 (commission_pct...gps_integrity_detail),
-- un simple REPLACE correría de posición a driver_name/driver_photo/etc. y
-- Postgres lo rechazaría. Se confirmó primero contra la base viva que nada
-- depende de esta vista (pg_depend, cero resultados) -- por eso aquí se hace
-- DROP + CREATE en vez de REPLACE, sin ese riesgo.
DROP VIEW IF EXISTS cc_request_detail_v;

CREATE VIEW cc_request_detail_v AS
SELECT
  r.*,
  au.raw_user_meta_data->>'full_name'                              AS driver_name,
  (SELECT selfie_url FROM ag_users WHERE auth_user_id = r.driver_id)   AS driver_photo,
  (SELECT phone      FROM ag_users WHERE auth_user_id = r.driver_id)   AS driver_phone,
  (SELECT AVG(stars)::NUMERIC(3,2) FROM ag_ratings WHERE driver_id = dag.id)        AS driver_rating,
  (SELECT COUNT(*) FROM ag_trips WHERE driver_id = dag.id AND status = 'completed') AS driver_trips,
  (SELECT jsonb_agg(jsonb_build_object(
      'order', s.stop_order, 'address', s.address, 'wait_min', s.wait_min
    ) ORDER BY s.stop_order)
   FROM cc_stops s WHERE s.request_id = r.id) AS stops_json,
  dag.id AS driver_ag_id
FROM cc_requests r
LEFT JOIN auth.users au ON au.id = r.driver_id
LEFT JOIN ag_users du ON du.auth_user_id = r.driver_id
LEFT JOIN ag_drivers dag ON dag.ag_user_id = du.id;
