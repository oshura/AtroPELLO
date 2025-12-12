# Guía rápida — Login TO³ + cookie compartida

> Este prompt se usa para responder a quienes preguntan "¿cómo engancho el login de TO³?". Resume el flujo vigente tras retirar el handshake `session:payload`.

## 1. Llama a `loginWithRedirect`
- Inyecta `AuthService` en el botón del header y ejecuta `this.auth.loginWithRedirect(window.location.href)`.
- El parámetro `returnTo` debe apuntar a la URL que debe recuperar foco tras `/auth/launch?return=...` (normalmente `window.location.href`).
- La landing maneja Cognito y, al finalizar, reescribe la cookie `atropello-session` antes de devolverte al `returnTo`.

## 2. Implementa `logoutWithRedirect`
- `this.auth.logoutWithRedirect(target)` limpia la cookie local y redirige al launcher de la landing: `https://www.atropello-games.es/auth/logout?return=${encodeURIComponent(target)}`.
- El path `/auth/logout` ahora muestra `AuthLogoutComponent`, guarda el `return` saneado y ejecuta `AuthService.logoutWithRedirect()` (landing), que a su vez llama al Hosted UI y limpia las cookies antes de decidir el destino final.
- TO³ sólo acepta destinos incluidos en `logoutReturnAllowlist`; si pasas un URL fuera de la lista se usa automáticamente `https://www.atropello-games.es/`, por lo que es normal quedarse en la landing tras cerrar sesión.

## 3. Lee la cookie compartida
- Busca `atropello-session` en `document.cookie`, separa el valor por `.` y decodifica el primer segmento base64:
  ```ts
  function readSharedSession() {
    const entry = document.cookie
      .split(';')
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith('atropello-session='));
    if (!entry) { return null; }
    const [payload] = entry.split('=')[1].split('.');
    return JSON.parse(atob(payload));
  }
  ```
- El JSON contiene `token`, `accessToken`, `issuedAt`, `expiresAt` y `profile`. La firma HMAC del segundo segmento es **opcional** salvo que quieras validar integridad (en ese caso copia `SessionCookieService`).
- Vuelve a hidratar `AuthService`/`CloudSavesSessionBridgeService` con los datos devueltos o muestra un CTA de login si la cookie no existe o expiró.

## 4. Pruebas mínimas
1. Ejecuta `/auth/launch?return=https://to3.atropello-games.es` manualmente y verifica que la cookie aparece en las DevTools.
2. Recarga TO³ y confirma que el header muestra el alias leído desde la cookie.
3. Repite el flujo tras `logoutWithRedirect` y valida que la cookie desaparece.
4. Cuando dispongas de credenciales Cognito para QA, corre `npm run test:e2e` para replicar el Playwright `auth.spec.ts` (ver repo landing, líneas 1-80) que comprueba:
   - Generación de la cookie tras `/auth/launch`.
   - Hidratación del header en la SPA.
   - Limpieza después de logout.

> Si alguna validación falla, adjunta capturas del valor de `atropello-session` y del panel de Application > Cookies al reportar el bug.
