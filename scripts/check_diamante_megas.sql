-- Verificar si 08diamante tiene mega grants asignados
SELECT * FROM referral_mega_grants
WHERE referrer_id = 'bf523689-cde5-47c9-9314-be13ca228be1'
ORDER BY created_at DESC;
