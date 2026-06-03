import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacidad y cookies — comparador de portátiles',
  description:
    'Política de privacidad y de cookies: qué datos tratamos, con qué base legal, cuánto los conservamos y cómo ejercer tus derechos.',
};

// Página estática. Los datos legales concretos (responsable, contacto, dominio)
// son PLACEHOLDERS marcados con [corchetes]: rellénalos antes de abrir el registro
// al público.
const RESPONSABLE = '[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE]';
const CONTACTO = '[email de contacto]';
const ULTIMA_ACTUALIZACION = '3 de junio de 2026';

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href="/"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Volver al catálogo
        </Link>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight">Privacidad y cookies</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Última actualización: {ULTIMA_ACTUALIZACION}
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <Section title="1. Quién es el responsable">
          <p>
            El responsable del tratamiento de tus datos es <strong>{RESPONSABLE}</strong>. Para
            cualquier cuestión sobre tus datos o esta política puedes escribir a{' '}
            <strong>{CONTACTO}</strong>.
          </p>
        </Section>

        <Section title="2. Qué datos tratamos y para qué">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Cuenta de usuario.</strong> Si te registras, tratamos tu{' '}
              <strong>correo electrónico</strong> y una versión cifrada (hash) de tu{' '}
              <strong>contraseña</strong>, con la única finalidad de crear tu cuenta y permitirte
              iniciar sesión. La autenticación la gestiona Supabase (ver apartado 6).
            </li>
            <li>
              <strong>Comparativas guardadas.</strong> Si guardas una comparativa, almacenamos los
              modelos seleccionados y el nombre que le pongas, asociados a tu cuenta, para que
              puedas recuperarla.
            </li>
            <li>
              <strong>No tratamos datos de pago.</strong> No vendemos directamente: la compra se
              realiza en la web del comercio (retailer) de destino, que aplica su propia política.
            </li>
          </ul>
        </Section>

        <Section title="3. Base legal">
          <p>
            El tratamiento de los datos de tu cuenta y tus comparativas se basa en la{' '}
            <strong>ejecución de la relación que solicitas</strong> al registrarte (art. 6.1.b
            RGPD). Navegar por el catálogo no requiere registro ni tratamiento de datos personales
            identificativos.
          </p>
        </Section>

        <Section title="4. Cuánto conservamos tus datos">
          <p>
            Conservamos los datos de tu cuenta y tus comparativas <strong>mientras la cuenta esté
            activa</strong>. Puedes <strong>borrar tu cuenta</strong> en cualquier momento desde{' '}
            <Link href="/cuenta" className="text-blue-600 underline hover:text-blue-700">
              tu cuenta
            </Link>
            ; el borrado elimina de forma inmediata tu usuario y, en cascada, tus comparativas
            guardadas.
          </p>
        </Section>

        <Section title="5. Tus derechos">
          <p>
            Puedes ejercer tus derechos de <strong>acceso, rectificación, supresión, portabilidad,
            limitación y oposición</strong> escribiendo a {CONTACTO}. El derecho de supresión puedes
            ejercerlo tú mismo borrando la cuenta. Si consideras que no hemos atendido tu solicitud,
            puedes reclamar ante la <strong>Agencia Española de Protección de Datos</strong> (
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-700"
            >
              aepd.es
            </a>
            ).
          </p>
        </Section>

        <Section title="6. Encargados y terceros">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Supabase</strong> — base de datos, autenticación y almacenamiento, con los
              datos alojados en la <strong>Unión Europea</strong>.
            </li>
            <li>
              <strong>Vercel</strong> — alojamiento de la web, con ejecución en región de la{' '}
              <strong>Unión Europea</strong> (Frankfurt).
            </li>
          </ul>
          <p className="mt-2">
            Ambos actúan como encargados del tratamiento bajo los acuerdos correspondientes. No se
            realizan transferencias internacionales de tus datos fuera del Espacio Económico
            Europeo.
          </p>
        </Section>

        <Section title="7. Cookies y almacenamiento local">
          <p>Este sitio usa el mínimo imprescindible. No usamos cookies de analítica ni de publicidad propias.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <strong>Cookies estrictamente necesarias.</strong> Al iniciar sesión, Supabase
              establece cookies de sesión para mantenerte autenticado. Sin ellas no es posible el
              inicio de sesión, por lo que están exentas de consentimiento.
            </li>
            <li>
              <strong>Almacenamiento local (localStorage).</strong> Guardamos en tu navegador la
              <strong> selección de portátiles a comparar</strong> y tu <strong>preferencia sobre
              este aviso de cookies</strong>. Esta información no sale de tu dispositivo ni se envía
              a nuestros servidores.
            </li>
          </ul>
        </Section>

        <Section title="8. Enlaces de afiliados">
          <p>
            Algunos enlaces a comercios son <strong>de afiliación</strong>: si compras tras pulsar
            uno de ellos, podemos recibir una comisión sin coste adicional para ti. Al salir hacia
            la web del comercio, este es un tercero independiente que aplica su propia política de
            privacidad y cookies, sobre las que no tenemos control.
          </p>
        </Section>

        <Section title="9. Cambios en esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios legales o del servicio. La fecha
            de «última actualización» del encabezado indica la versión vigente.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-medium text-zinc-900 dark:text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}
