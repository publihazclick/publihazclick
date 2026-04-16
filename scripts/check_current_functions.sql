-- Ver las funciones clave del sistema de referidos
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_referral_click_bonus',
    'get_mini_referral_slots_per_affiliate',
    'grant_referral_mega_rewards',
    'consume_referral_mega_grant',
    'get_dc_level',
    'record_ptc_click',
    'get_user_ad_limits',
    'renew_package_with_balance',
    'activate_user_package'
  )
ORDER BY routine_name;
