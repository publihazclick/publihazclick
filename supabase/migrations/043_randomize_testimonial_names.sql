-- Reasignar nombres y comentarios variados a los testimonios existentes
-- Se usa un DO block con un array grande de nombres y comentarios diversos
DO $$
DECLARE
  rec RECORD;
  names TEXT[] := ARRAY[
    'Andrea Marcela Torres','Luis Felipe García','Tatiana Ospina','Brayan Morales',
    'Yessica Ramírez','Jonatan Herrera','Paola Andrea Ríos','Steeven Muñoz',
    'Leidy Johana Cruz','Dairo Castellanos','Xiomara Pedraza','Wilmar Acevedo',
    'Nathaly Bermúdez','Jhon Jairo López','Karen Sofía Vega','Elkin Patiño',
    'Camilo V.','Juli R.','Pipe F.','Santi G.','Mafe L.','Dani B.',
    'Caro M.','Fer T.','Ale C.','Nata P.','Sebas H.','Vale O.',
    'juanchi_bogota','andres.movil','pipe_cali09','mary_oficial',
    'carlos2024col','laura_emprende','yessi.pays','miguelito_ptc',
    'sofi.trabaja','tato_gana','kikeguerrero','isabelitacol',
    'jota_retiros','cami_cash','natalia_real','dairo_inversiones',
    'Yurany','Bladimir','Karent','Ferney','Yadira','Duvan',
    'Marisol','Kleiver','Lorena','Sneider','Vanessa','Robinsón'
  ];
  comments TEXT[] := ARRAY[
    'Llegó. Sin más que decir. ✅',
    'Pago recibido. Primera vez y funcionó perfecto.',
    'Real. Sin trucos. Aquí está el comprobante 🔥',
    'Cobré hoy. No lo podía creer hasta que vi la notificación.',
    'Mi retiro en cuenta. Esto sí paga.',
    'Llevo 3 semanas y ya van 2 retiros exitosos. Esto es constante 💸',
    'Primer mes completo y el pago llegó puntual. Seguiré así 💪',
    'Seis meses activa en la plataforma y jamás me han fallado. Récord personal este retiro 🏆',
    'Cuatro pagos recibidos desde que me uní. Cada vez mejor.',
    'Un año en Publihazclick. Doce meses, doce pagos. Eso lo dice todo 💯',
    'Mi mamá no me creía, le mostré esto y ya me está preguntando cómo se registra 😂',
    'Le dije a mi novio que esto era real y hoy le demostré con el comprobante. Jajaja 🎉',
    'Dudé mucho antes de unirme. Hoy me arrepiento de no haberlo hecho antes.',
    'Mi hermano me recomendó esto hace 2 meses. Ya recuperé lo que invertí y sigo sumando.',
    'Pensé que era una de tantas páginas falsas. Error mío. Esto paga y punto.',
    'Retiro procesado. Sin retrasos.',
    'Comprobante verificado. Plataforma confiable.',
    'Pago #7. Todo correcto como siempre.',
    'Tercer retiro del mes. Proceso rápido.',
    'Acreditado hoy. Sin problema alguno.',
    'Si estás dudando, este screenshot es tu respuesta. Únete ya 👆',
    'Los que no están en Publihazclick se están perdiendo ingresos reales. Aquí la prueba.',
    'Comparto esto para que vean que sí funciona. No hay excusa para no intentarlo.',
    'Para los que preguntan si pagan: sí. Aquí está mi comprobante de hoy.',
    'Recomendado al 100%. No es cuento. Este es mi pago de esta semana 🙌',
    'Empecé solo viendo 3 o 4 anuncios al día y ya genero un ingreso extra que me ayuda bastante.',
    'Lo bueno de Publihazclick es que no te piden nada raro. Ves anuncios, acumulas, retiras.',
    'El proceso de retiro es rapidísimo. Lo solicité ayer y hoy ya estaba en mi cuenta.',
    'Me gustó que desde el primer día vi resultados. Sin esperas absurdas.',
    'Fácil de usar, pagos rápidos y sin letras pequeñas. Eso es lo que más valoro.',
    'Este fue mi retiro más alto hasta ahora. Voy creciendo cada semana 📈',
    'Primer retiro pequeño pero importante. La constancia va sumando.',
    'Ya superé lo que ganaba haciendo cosas extra los fines de semana. Impresionante.',
    'No es para hacerse millonario, pero como ingreso complementario es excelente.',
    '¿Ves este comprobante? Tú también puedes tenerlo. Solo necesitas constancia.',
    'Cada día que no te unes es un día de ingresos perdidos. Así de simple.',
    'Empecé con cero experiencia y aquí estoy, retirando. Todo el mundo puede.',
    'La clave es ser constante. El pago llega solo.',
    'Che, llegó mi pago. Justo a tiempo para el mercado de la semana 😄',
    'Usé las ganancias de este mes para pagar el internet. Auto sostenible casi 😅',
    'Aburrida en casa y encontré Publihazclick. Ahora el aburrimiento me paga 😂',
    'Este dinero lo uso para los gusticos sin afectar el presupuesto familiar 🙏',
    'El sistema de referidos también suma bastante. Ya tengo 4 amigos activos.',
    'Mis referidos me están generando ingresos pasivos. Esto escala bien.',
    'Aparte del pago por anuncios, los bonos por referidos son un extra nada despreciable.',
    'Comprobante de pago recibido satisfactoriamente. Plataforma seria y confiable.',
    'Segundo mes consecutivo recibiendo mi retiro sin inconvenientes. Muy conforme.',
    'Proceso transparente desde el inicio. El dinero llega cuando dicen que llega.',
    'Cuatro meses usando la plataforma. Ningún problema hasta la fecha.',
    'Recomendable para quienes buscan un ingreso adicional sin mayor complicación.',
    '¡LLEGÓÓÓ! 🎊🎊 No puedo creer que esto sea real. Gracias Publihazclick 🙌🙌',
    'PAGO RECIBIDO 🔥🔥 Esto sí funciona amigos, no pierdan tiempo y únanse ya!',
    '¡Woooo! Tercer pago del mes y subiendo. Alguien que me diga cómo parar 🚀😂',
    '¡Esto es una locura! Empecé sin creer y ahora no puedo parar de recibir pagos 🤩'
  ];
  i INTEGER := 0;
  name_idx INTEGER;
  comment_idx INTEGER;
BEGIN
  FOR rec IN SELECT id FROM payment_testimonials ORDER BY created_at LOOP
    name_idx    := (i * 7  + 3) % array_length(names,    1) + 1;
    comment_idx := (i * 11 + 5) % array_length(comments, 1) + 1;
    UPDATE payment_testimonials
      SET username = names[name_idx],
          comment  = comments[comment_idx]
    WHERE id = rec.id;
    i := i + 1;
  END LOOP;
END $$;
