SELECT username, role, has_active_package, package_expires_at::text
FROM profiles
WHERE role IN ('admin', 'dev')
ORDER BY username;
