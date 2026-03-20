-- Añadir columna phash a payment_testimonials para detección de duplicados
ALTER TABLE payment_testimonials ADD COLUMN IF NOT EXISTS phash TEXT;
