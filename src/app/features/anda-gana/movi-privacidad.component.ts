import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-movi-privacidad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'display:block;min-height:100vh;background:#060b17;color:#e2e8f0;font-family:Inter,system-ui,sans-serif',
  },
  template: `
  <div style="max-width:760px;margin:0 auto;padding:0 20px 64px">

    <!-- Cabecera -->
    <div style="position:sticky;top:0;z-index:10;background:rgba(6,11,23,0.92);backdrop-filter:blur(8px);
      padding:max(20px,env(safe-area-inset-top)) 0 16px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:32px">
      <div style="display:flex;align-items:center;gap:12px">
        <a href="/anda-gana" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.06);
          display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none">
          <span class="material-symbols-outlined" style="color:#94a3b8;font-size:20px">arrow_back</span>
        </a>
        <img src="/movi-logo.svg" alt="Movi" style="width:32px;height:32px;border-radius:8px" />
        <div>
          <p style="color:#fff;font-weight:900;font-size:15px;margin:0;font-family:Montserrat,sans-serif">Movi</p>
          <p style="color:#64748b;font-size:11px;margin:0">Política de Privacidad</p>
        </div>
      </div>
    </div>

    <h1 style="color:#fff;font-weight:900;font-size:24px;margin:0 0 6px;font-family:Montserrat,sans-serif;letter-spacing:-0.02em">
      Política de Privacidad y Tratamiento de Datos Personales
    </h1>
    <p style="color:#64748b;font-size:13px;margin:0 0 32px">Última actualización: agosto de 2026</p>

    <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 28px">
      Esta Política explica qué datos personales recolecta <strong style="color:#fff">Movi</strong>, para qué
      los usa, con quién los comparte, y qué derechos tienes sobre ellos, en cumplimiento de la
      <strong style="color:#fff">Ley 1581 de 2012</strong> y el Decreto 1377 de 2013 de Colombia. Al usar Movi
      aceptas el tratamiento de tus datos personales conforme a lo descrito aquí.
    </p>

    <!-- 1 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">1. Responsable del tratamiento</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Movi es responsable del tratamiento de los datos personales que recolecta a través de la aplicación,
        con el fin de operar la plataforma de intermediación entre pasajeros y conductores descrita en los
        <a href="/anda-gana/terminos" style="color:#6E93F2">Términos y Condiciones</a>.
      </p>
    </section>

    <!-- 2 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">2. Qué datos recolectamos</h2>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Datos de identidad y contacto</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 14px">
        Nombre completo, fecha de nacimiento, número de cédula, país/departamento/ciudad, número de celular
        y correo electrónico.
      </p>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Documentos de verificación (solo conductores)</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 14px">
        Fotos de la cédula (anverso y reverso), selfie sosteniendo la cédula, licencia de conducción, SOAT,
        tarjeta de propiedad, revisión técnico-mecánica, y en algunos casos el resultado de una consulta de
        antecedentes judiciales y validación de la licencia ante el RUNT.
      </p>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Datos del vehículo</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 14px">
        Placa, marca, modelo, año, color y tipo de cada vehículo registrado.
      </p>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Ubicación (GPS)</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 14px">
        La posición del conductor mientras está conectado y disponible, y la posición de conductor y pasajero
        durante un viaje activo, con el fin de mostrar el mapa en tiempo real y verificar que el trayecto
        realmente ocurrió como fue acordado.
      </p>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Datos financieros</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 14px">
        Saldo de tu billetera dentro de la app, historial de recargas y transacciones, y ganancias por
        comisiones o referidos. Movi no almacena los datos completos de tu tarjeta o método de pago -- esos
        los procesa directamente la pasarela de pagos.
      </p>

      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Comunicaciones y uso de la app</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Mensajes de chat entre pasajero y conductor dentro de un viaje, registros de llamadas dentro de la
        app (sin exponer tu número real), historial de viajes, calificaciones, y el identificador de tu
        dispositivo usado para enviarte notificaciones push.
      </p>
    </section>

    <!-- 3 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">3. Datos sensibles</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        La foto de tu cédula y tu selfie de verificación se procesan con tecnología de reconocimiento facial
        para confirmar que la persona que se registra es la dueña del documento, y la consulta de
        antecedentes judiciales revisa si tienes procesos activos ante la Rama Judicial. Estos son datos de
        tratamiento especial bajo la ley colombiana. Al subir estos documentos para registrarte como
        conductor, das tu autorización expresa para este tratamiento específico. Puedes negarte a
        proporcionarlos, pero en ese caso no podrás completar tu registro como conductor.
      </p>
    </section>

    <!-- 4 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">4. Para qué usamos tus datos</h2>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
        <li>Crear y verificar tu cuenta, y confirmar tu identidad y la de tu vehículo.</li>
        <li>Conectar pasajeros y conductores, mostrar el mapa y calcular rutas y precios.</li>
        <li>Procesar comisiones, recargas, bonos y pagos a referidos.</li>
        <li>Enviarte notificaciones sobre tus viajes, tu cuenta y el vencimiento de tus documentos.</li>
        <li>Verificar que un viaje se realizó como fue acordado, en caso de una disputa o reporte.</li>
        <li>Brindar soporte, atender reportes de seguridad, y responder a un botón de pánico activado.</li>
        <li>Cumplir obligaciones legales, como entregar información a una autoridad competente bajo un
          proceso legal formal.</li>
      </ul>
    </section>

    <!-- 5 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">5. Con quién compartimos tus datos</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 10px">
        No vendemos tus datos personales. Los compartimos únicamente con proveedores que nos ayudan a operar
        la Plataforma, bajo las siguientes finalidades:
      </p>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0 0 10px;padding-left:20px">
        <li>Proveedores de mensajería (SMS/WhatsApp) para enviarte códigos de verificación y avisos.</li>
        <li>Proveedores de verificación de identidad y consulta de antecedentes/licencia ante entidades
          oficiales colombianas.</li>
        <li>Un proveedor de inteligencia artificial, para leer automáticamente los datos y fechas de
          vencimiento de tus documentos a partir de la foto que subes.</li>
        <li>La pasarela de pagos, para procesar recargas de tu billetera.</li>
        <li>Proveedores de mapas y geolocalización, para calcular rutas, distancias y direcciones.</li>
        <li>Proveedores de infraestructura en la nube, donde se almacenan de forma segura la base de datos y
          los archivos de la Plataforma.</li>
      </ul>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Algunos de estos proveedores (en particular, el de inteligencia artificial para lectura de
        documentos) procesan la información en servidores fuera de Colombia. Al usar Movi autorizas esta
        transferencia internacional, necesaria para prestar el servicio.
      </p>
    </section>

    <!-- 6 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">6. Cuánto tiempo conservamos tus datos</h2>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
        <li>Ubicación GPS de tus viajes: se elimina automáticamente a los 30 días.</li>
        <li>Token de notificaciones de tu dispositivo: se elimina si no usas la app durante 60 días.</li>
        <li>Datos de identidad, documentos e historial de cuenta: se conservan mientras tu cuenta esté
          activa. Si das de baja tu cuenta, se conservan solo el tiempo mínimo necesario por obligaciones
          legales o contables, y luego se eliminan o se anonimizan.</li>
      </ul>
    </section>

    <!-- 7 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">7. Cómo protegemos tus datos</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Tu información se almacena cifrada en tránsito y en reposo. El acceso a la base de datos está
        restringido por reglas de seguridad que solo permiten a cada usuario ver su propia información. Los
        documentos que subes se guardan en almacenamiento privado, nunca públicamente accesible: solo se
        genera un enlace temporal cuando la propia Plataforma necesita mostrarlo o procesarlo.
      </p>
    </section>

    <!-- 8 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">8. Tus derechos</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 10px">
        Como titular de tus datos personales, tienes derecho a:
      </p>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0 0 10px;padding-left:20px">
        <li><strong style="color:#fff">Conocer y acceder</strong> a los datos personales que tenemos sobre ti.</li>
        <li><strong style="color:#fff">Actualizar y rectificar</strong> tu información cuando esté incompleta o
          incorrecta.</li>
        <li><strong style="color:#fff">Solicitar la eliminación</strong> de tus datos cuando ya no sean
          necesarios o hayas retirado tu autorización, salvo que exista un deber legal de conservarlos.</li>
        <li><strong style="color:#fff">Oponerte</strong> a un uso específico de tus datos.</li>
        <li><strong style="color:#fff">Revocar tu autorización</strong> en cualquier momento.</li>
        <li><strong style="color:#fff">Presentar quejas</strong> ante la Superintendencia de Industria y
          Comercio si consideras que tus datos no se están tratando correctamente.</li>
      </ul>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Puedes ejercer estos derechos, o dar de baja tu cuenta directamente, desde la sección de Seguridad de
        la app, o escribiéndonos por WhatsApp desde el menú de soporte.
      </p>
    </section>

    <!-- 9 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">9. Menores de edad</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Movi está dirigido únicamente a personas mayores de edad. No recolectamos intencionalmente datos de
        menores de edad.
      </p>
    </section>

    <!-- 10 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#6E93F2;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">10. Cambios a esta política</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Podemos actualizar esta Política cuando cambien las funciones de la Plataforma o la normativa
        aplicable. El uso continuado de Movi después de una actualización implica la aceptación de los
        cambios.
      </p>
    </section>

    <!-- Contacto -->
    <div style="margin-top:40px;padding:18px;border-radius:16px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.25)">
      <p style="color:#6E93F2;font-weight:900;font-size:13px;margin:0 0 6px;font-family:Montserrat,sans-serif">¿Quieres ejercer tus derechos o tienes dudas?</p>
      <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin:0">
        Escríbenos por WhatsApp desde el menú de soporte dentro de la app.
      </p>
    </div>

    <a href="/anda-gana/terminos" style="display:block;text-align:center;margin-top:24px;color:#64748b;font-size:12px;text-decoration:none">
      Ver Términos y Condiciones
    </a>
    <a href="/anda-gana" style="display:block;text-align:center;margin-top:10px;color:#64748b;font-size:12px;text-decoration:none">
      ← Volver a Movi
    </a>
  </div>
  `,
})
export class MoviPrivacidadComponent {}
