-- =============================================================================
-- Migration 064: Fix accented characters in SVG data URI banners
-- Characters like é, ó, í, ú, ñ, ü, á need URL encoding in data:image/svg+xml
-- =============================================================================

UPDATE banner_ads
SET image_url = replace(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(image_url,
                          'á', '%C3%A1'),
                        'é', '%C3%A9'),
                      'í', '%C3%AD'),
                    'ó', '%C3%B3'),
                  'ú', '%C3%BA'),
                'ñ', '%C3%B1'),
              'ü', '%C3%BC'),
            'Á', '%C3%81'),
          'É', '%C3%89'),
        'Í', '%C3%8D'),
      'Ó', '%C3%93'),
    'Ú', '%C3%9A'),
  'Ñ', '%C3%91'),
'Ü', '%C3%9C')
WHERE image_url LIKE 'data:image/svg+xml,%';
