SELECT id, title, ad_type, advertiser_id,
  (SELECT username FROM profiles WHERE id = ptc_tasks.advertiser_id) AS advertiser_username,
  image_url, status
FROM ptc_tasks
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 20;
