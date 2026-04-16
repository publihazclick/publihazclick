-- Buscar el paquete de 25 USD
SELECT id, name, price, price_cop, duration_days, package_type
FROM packages
WHERE price = 25 OR price_cop = 98000
ORDER BY price;
