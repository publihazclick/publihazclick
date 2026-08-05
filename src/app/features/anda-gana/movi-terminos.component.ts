import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-movi-terminos',
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
          <p style="color:#64748b;font-size:11px;margin:0">Términos y Condiciones</p>
        </div>
      </div>
    </div>

    <h1 style="color:#fff;font-weight:900;font-size:24px;margin:0 0 6px;font-family:Montserrat,sans-serif;letter-spacing:-0.02em">
      Términos y Condiciones de Uso
    </h1>
    <p style="color:#64748b;font-size:13px;margin:0 0 32px">Última actualización: agosto de 2026</p>

    <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 28px">
      Bienvenido a <strong style="color:#fff">Movi</strong>. Estos Términos y Condiciones regulan el uso de la
      plataforma Movi (la "Plataforma") por parte de pasajeros y conductores. Al crear una cuenta o usar
      la aplicación, aceptas estos términos en su totalidad. Si no estás de acuerdo, no debes usar la Plataforma.
    </p>

    <!-- 1 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">1. Qué es Movi</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Movi es una plataforma tecnológica que conecta a pasajeros con conductores independientes de vehículos
        particulares (carro y moto) para facilitar el transporte de personas dentro de Colombia. Movi actúa
        únicamente como intermediario tecnológico: no presta directamente el servicio de transporte, no es
        una empresa transportadora, y los conductores no son empleados de Movi sino usuarios independientes
        de la Plataforma.
      </p>
    </section>

    <!-- 2 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">2. Registro y elegibilidad</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 10px">
        Para usar Movi debes ser mayor de edad y registrarte con un número de celular válido, verificado
        mediante un código de un solo uso (OTP).
      </p>
      <p style="color:#94a3b8;font-size:13px;font-weight:700;margin:0 0 6px">Requisitos adicionales para conductores:</p>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
        <li>Cédula de ciudadanía colombiana vigente. Por ahora Movi solo acepta conductores con documento de
          identidad colombiano.</li>
        <li>Licencia de conducción vigente, con categoría que permita el transporte de pasajeros.</li>
        <li>SOAT y revisión técnico-mecánica (tecnomecánica) vigentes para cada vehículo con el que operes.</li>
        <li>Vehículo (carro o moto) dentro del límite de antigüedad permitido: máximo 23 años para carros y
          17 años para motos, contados desde el modelo del vehículo. El vehículo puede tener origen
          colombiano o venezolano.</li>
        <li>Verificación de antecedentes y validación de la licencia antes de la aprobación de la cuenta.</li>
      </ul>
    </section>

    <!-- 3 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">3. Cómo funciona el servicio</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        El pasajero solicita un viaje indicando origen y destino, y propone un precio. Los conductores
        disponibles pueden aceptar el precio ofrecido o enviar una contraoferta. Movi no fija tarifas: el
        precio final se acuerda libremente entre pasajero y conductor dentro de la Plataforma. Una vez
        aceptada la oferta, el viaje queda confirmado y ambas partes pueden hacer seguimiento en tiempo real
        hasta finalizar el trayecto.
      </p>
    </section>

    <!-- 4 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">4. Tarifas, comisión y pagos</h2>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
        <li>Los conductores mantienen un saldo prepago (wallet) que recargan a través de los métodos de pago
          disponibles en la Plataforma.</li>
        <li>Al aceptar una oferta o contraoferta, se descuenta automáticamente del saldo del conductor una
          comisión sobre el valor del viaje.</li>
        <li>Si el viaje se cancela <strong style="color:#fff">antes</strong> de que el conductor recoja al
          pasajero, la comisión se reembolsa automáticamente al saldo del conductor. Si se cancela
          <strong style="color:#fff">después</strong> de recoger al pasajero, la comisión no se reembolsa.</li>
        <li>Los conductores pueden recibir bonos en efectivo al alcanzar ciertos hitos de viajes completados.</li>
        <li>Programa de invitados: quien invita a un nuevo usuario a Movi recibe una comisión sobre el valor
          de los viajes que ese invitado realice, mientras la invitación esté vigente.</li>
      </ul>
    </section>

    <!-- 5 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">5. Documentos y vigencia</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Los documentos del conductor (licencia) y de cada vehículo registrado (SOAT, tecnomecánica, seguro)
        deben mantenerse vigentes en todo momento. La Plataforma avisa dentro de la aplicación cuando un
        documento está próximo a vencer. Si un documento vence, la cuenta del conductor se suspende
        automáticamente para recibir nuevos viajes hasta que el documento sea renovado y vuelto a cargar. Un
        conductor puede registrar más de un vehículo (por ejemplo, carro y moto); cada vehículo mantiene sus
        propios documentos de forma independiente.
      </p>
    </section>

    <!-- 6 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">6. Seguridad</h2>
      <ul style="color:#cbd5e1;font-size:14px;line-height:1.8;margin:0;padding-left:20px">
        <li>Botón de pánico/SOS disponible durante el viaje.</li>
        <li>Seguimiento por GPS del conductor y, durante trayectos activos, también del pasajero, con el
          único fin de verificar que el viaje se realizó según lo acordado y de brindar soporte ante
          disputas o emergencias. Estos datos de ubicación se conservan por un tiempo limitado y luego se
          eliminan automáticamente.</li>
        <li>Las llamadas entre pasajero y conductor dentro de la app no revelan el número de teléfono real de
          ninguna de las partes.</li>
        <li>Sistema de calificación mutua entre pasajeros y conductores, y posibilidad de bloquear a otro
          usuario para no volver a coincidir con él.</li>
      </ul>
    </section>

    <!-- 7 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">7. Privacidad de tus datos</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0 0 10px">
        Para operar la Plataforma recolectamos datos de identidad (documento, licencia, fotos de
        verificación), ubicación durante los viajes, historial de viajes y comunicaciones dentro de la app.
      </p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Tus documentos de identidad son privados y solo son accesibles para Movi. Únicamente se entregarían a
        una autoridad competente si lo exige un proceso legal formal, en el marco de una investigación por un
        delito cometido contra un conductor o pasajero. Puedes solicitar la baja de tu cuenta en cualquier
        momento desde la sección de Seguridad de la app.
      </p>
    </section>

    <!-- 8 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">8. Conducta esperada</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Se espera un trato respetuoso entre todos los usuarios de la Plataforma. Está prohibido usar Movi
        para fines ilegales, fraudulentos, o para poner en riesgo la seguridad de otros usuarios. Movi se
        reserva el derecho de suspender o cancelar cuentas ante conductas fraudulentas, abuso, cancelaciones
        de mala fe reiteradas, o incumplimiento de estos Términos.
      </p>
    </section>

    <!-- 9 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">9. Responsabilidad</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Movi facilita el encuentro entre pasajeros y conductores independientes, pero no presta directamente
        el servicio de transporte. Movi no es responsable por accidentes, retrasos, pérdidas o daños
        ocurridos durante un viaje que sean atribuibles a la conducta del conductor o del pasajero, sin
        perjuicio de las herramientas de verificación, seguimiento y seguridad que la Plataforma pone a
        disposición para reducir esos riesgos.
      </p>
    </section>

    <!-- 10 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">10. Modificaciones</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Estos Términos pueden actualizarse periódicamente para reflejar cambios en la Plataforma. El uso
        continuado de Movi después de una actualización implica la aceptación de los nuevos términos.
      </p>
    </section>

    <!-- 11 -->
    <section style="margin-bottom:28px">
      <h2 style="color:#a78bfa;font-weight:900;font-size:16px;margin:0 0 10px;font-family:Montserrat,sans-serif">11. Ley aplicable</h2>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.7;margin:0">
        Estos Términos se rigen por las leyes de la República de Colombia.
      </p>
    </section>

    <!-- Contacto -->
    <div style="margin-top:40px;padding:18px;border-radius:16px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.25)">
      <p style="color:#a78bfa;font-weight:900;font-size:13px;margin:0 0 6px;font-family:Montserrat,sans-serif">¿Tienes dudas?</p>
      <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin:0">
        Escríbenos por WhatsApp desde el menú de soporte dentro de la app.
      </p>
    </div>

    <a href="/anda-gana" style="display:block;text-align:center;margin-top:32px;color:#64748b;font-size:12px;text-decoration:none">
      ← Volver a Movi
    </a>
  </div>
  `,
})
export class MoviTerminosComponent {}
