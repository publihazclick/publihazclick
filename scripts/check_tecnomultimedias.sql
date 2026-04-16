SELECT username, role, has_active_package, package_expires_at::text, current_package_id, package_started_at::text
FROM profiles
WHERE email = 'tecnomultimedias@gmail.com';
