-- Script para insertar anuncios demo y banners para la landing page
-- Ejecutar en Supabase SQL Editor
-- IMPORTANTE: Primero ejecuta update-admin-referral-code.sql si no has establecido el código de referido del admin

-- Obtener el ID del admin
DO $$
DECLARE
    admin_id UUID;
BEGIN
    -- Buscar el ID del admin
    SELECT id INTO admin_id 
    FROM profiles 
    WHERE email = 'publihazclick.com@gmail.com' 
    AND role = 'admin';

    RAISE NOTICE 'Admin ID: %', admin_id;

    -- ================================================================================
    -- INSERTAR BANNERS PARA LA LANDING PAGE
    -- ================================================================================
    
    INSERT INTO banner_ads (
        advertiser_id,
        name,
        description,
        image_url,
        url,
        position,
        impressions_limit,
        clicks_limit,
        reward,
        status,
        location,
        created_at
    ) VALUES 
    (
        admin_id,
        'Gana dinero viendo anuncios',
        'Únete a PublihazClick y comienza a earn dinero hoy',
        'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=400&fit=crop',
        'https://publihazclick.com/register',
        'header',
        100000,
        10000,
        0,
        'active',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Promociones exclusivas',
        'Ofertas especiales solo para miembros',
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=400&fit=crop',
        'https://publihazclick.com/register',
        'sidebar',
        50000,
        5000,
        0,
        'active',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Únete a nuestra comunidad',
        'Miles de usuarios ya están ganando',
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=400&fit=crop',
        'https://publihazclick.com/register',
        'footer',
        30000,
        3000,
        0,
        'active',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Tu primer retiro',
        'Retira tus ganancias de forma rápida y segura',
        'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&h=400&fit=crop',
        'https://publihazclick.com/register',
        'interstitial',
        20000,
        2000,
        0,
        'active',
        'landing',
        NOW()
    );

    RAISE NOTICE 'Banners insertados correctamente';

    -- ================================================================================
    -- INSERTAR ANUNCIOS PTC PARA LA LANDING PAGE (Demo)
    -- ================================================================================

    INSERT INTO ptc_tasks (
        advertiser_id,
        title,
        description,
        url,
        image_url,
        reward,
        duration,
        daily_limit,
        total_clicks,
        status,
        ad_type,
        location,
        created_at
    ) VALUES 
    -- Mega Anuncios
    (
        admin_id,
        'Promo Fin de Semana - Tienda Online',
        'Visita nuestra tienda online y descubre ofertas exclusivas',
        'https://mileniustore.com',
        'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
        2.00,  -- reward en USD
        30,
        100,
        450,
        'active',
        'mega',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Restaurante Los Parados',
        'Reserva tu mesa y disfruta de nuestra gastronomía',
        'https://losparados.com',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
        2.00,
        30,
        120,
        580,
        'active',
        'mega',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Gran Venta de Electrónicos',
        'Los mejores precios en tecnología',
        'https://tecnoworld.com',
        'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
        2.00,
        30,
        80,
        320,
        'active',
        'mega',
        'landing',
        NOW()
    ),
    -- Standard 400
    (
        admin_id,
        'Nueva Colección de Ropa',
        'Moda trends para esta temporada',
        'https://fashioncolombia.com',
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        0.40,
        20,
        80,
        320,
        'active',
        'standard_400',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Zapatillas Importadas',
        'Las mejores marcas a precios únicos',
        'https://shoestore.com',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
        0.40,
        20,
        70,
        280,
        'active',
        'standard_400',
        'landing',
        NOW()
    ),
    -- Standard 600
    (
        admin_id,
        'Servicio de Delivery Express',
        'Recibe tus productos en tiempo record',
        'https://deliveryexpress.com',
        'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
        0.60,
        25,
        60,
        180,
        'active',
        'standard_600',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Clases de Guitarra Online',
        'Aprende guitarra con profesores certificados',
        'https://carlosmusica.com',
        'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=300&fit=crop',
        0.60,
        25,
        40,
        150,
        'active',
        'standard_600',
        'landing',
        NOW()
    ),
    -- Mini Anuncios
    (
        admin_id,
        'Cupón Descuento 20%',
        'Usa el código SAVE20 en tu próxima compra',
        'https://technoshop.com',
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
        0.08,
        15,
        50,
        120,
        'active',
        'mini',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Clases de Inglés Online',
        'Inglés para todos los niveles',
        'https://mariagarcia.com',
        'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
        0.08,
        15,
        30,
        85,
        'active',
        'mini',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Desayunos Sorpresa',
        'Sorprende a quien más quieres',
        'https://sweetdelivery.com',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
        0.08,
        15,
        45,
        180,
        'active',
        'mini',
        'landing',
        NOW()
    ),
    (
        admin_id,
        'Reparación de Computadores',
        'Servicio técnico especializado',
        'https://techfix.com',
        'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=300&fit=crop',
        0.08,
        15,
        25,
        65,
        'active',
        'mini',
        'landing',
        NOW()
    );

    RAISE NOTICE 'Anuncios PTC insertados correctamente';
    RAISE NOTICE 'Total anuncios insertados para landing';
END $$;
