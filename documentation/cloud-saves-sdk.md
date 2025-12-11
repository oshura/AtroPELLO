# SDK Cloud Saves reutilizable

Este documento describe cómo reutilizar la carpeta `src/app/libs/cloud-saves/` en cualquier SPA Angular (>= v17, zoneless compatible). El objetivo es exponer una API neutra para consumir la nueva capa REST de guardados sin arrastrar dependencias de S3/Lambda en el frontend.

## Componentes incluidos

- **Modelos (`cloud-saves.models.ts`)**: describe `CloudSaveMasterFile`, `CloudSaveSlotRef` y los payloads esperados por el servicio REST.
- **Cliente (`cloud-saves.client.ts`)**: implementación que ejecuta `listSlots`, `putSave` y `deleteSave` contra el endpoint REST real usando `fetch` (con latencia opcional simulada para pruebas).
- **Servicio Angular (`cloud-saves.service.ts`)**: envoltorio reactivo (signals) que usa el cliente, gestiona sesión, errores y slots sincronizados.
- **Panel standalone (`components/saved-games-panel`)**: UI opcional con copy personalizable para gatillar `sync`, `loadLatest` y `manage`.
- **Tokens (`cloud-saves.tokens.ts`)**: InjectionTokens para settings, contexto del juego y bridge de sesión (también expone identidad del usuario vía `CloudSavesSessionBridge`).

## Pasos para integrarlo en otro repositorio

1. **Copiar la carpeta** `src/app/libs/cloud-saves/` al nuevo proyecto (conserva la misma ruta para evitar cambios relativos).
2. **Declarar settings compartidos** inyectando `CLOUD_SAVES_SETTINGS` con `{ apiBaseUrl, mockLatencyMs }`. El cliente ya consume la API real, así que apunta `apiBaseUrl` al dominio publicado (`https://api.atropello-games.es/cloud-saves`) y deja `mockLatencyMs = 0` salvo que necesites simular latencia en entornos de QA.
3. **Definir el contexto del juego** con `CLOUD_SAVES_GAME_CONTEXT`, indicando únicamente `gameId`.
4. **Implementar un session bridge** que cumpla `CloudSavesSessionBridge` (`getToken()` + `onSessionChange`). Reutiliza `CloudSavesSessionBridgeService` para leer la cookie compartida y, si el dominio remoto no ejecuta Angular, embebe el iframe `/bridge.html` hospedado en `www` para obtener los tokens vía `postMessage`.
5. **Inyectar `CloudSavesService`** en los componentes que necesiten operar slots o emplear el `SavedGamesPanelComponent` standalone si sólo deseas el panel por defecto.

## Kit "from-landing"

Para acelerar la integración en otros juegos, la carpeta [`src/app/libs/cloud-saves/from-landing`](../src/app/libs/cloud-saves/from-landing) contiene copias de referencia 1:1 de los artefactos usados por la landing. Están excluidos del build (`tsconfig.app.json > exclude`) y no participan en SSR; su único propósito es permitir copiar/pegar en otro repositorio manteniendo los mismos contratos.

### session-bridge-worker.component.ts (referencia)

- Replica el `SessionBridgeWorkerComponent` que responde a los mensajes `session:get`, `session:clear` y `session:ping` utilizados por el iframe `/bridge.html`.
- Incluye `addEventListener('message', ...)`, delega en `SessionCookieService` y emite `postMessage` con `session:data`.
- Ajusta el namespace del servicio/cookies según el dominio de tu juego si cambias el `hostedUiDomain`.

### session-cookie.service.ts (referencia)

- Servicio standalone con `@Injectable({ providedIn: 'root' })` que serializa el ID Token + perfil en la cookie `atropello-session` usando `AES-GCM` + `localStorage` para cachear la llave.
- Expone `writeTokens`, `readTokens` y `clearCookie` para que cualquier SPA comparta la sesión Cognito entre subdominios.
- Asegúrate de conservar `SameSite=None; Secure` cuando copies el archivo para no perder compatibilidad cross-site.

### cloud-settings.ts (referencia)

El archivo copia exactamente los valores productivos empleados por la landing. Usa la tabla como checklist antes de publicarlo en otro dominio:

| Campo | Valor referencia |
| --- | --- |
| `region` | `us-east-1` |
| `userPoolId` | `us-east-1_LUb5DU8t5` |
| `userPoolWebClientId` | `6rokvnv3eveofdjb1vlmsrqhkp` |
| `identityPoolId` | _vacío_ (no requerido por TO³) |
| `hostedUiDomain` | `auth.atropello-games.es` |
| `loginRedirectUri` | `https://www.atropello-games.es/auth/callback` |
| `logoutRedirectUri` | `https://www.atropello-games.es/` |
| `savesApiBaseUrl` | `https://api.atropello-games.es/cloud-saves` |
| `returnAllowlist` | `["https://www.atropello-games.es", "https://to3.atropello-games.es"]` |
| `enableSavedGamesCta` | `true` |
| `hostedUiScopes` | `["openid", "email", "profile"]` |

### Cómo usar el kit en otro juego

1. Copia los tres archivos de `from-landing` hacia la carpeta equivalente de tu proyecto (respeta la ruta para evitar problemas de resolución).
2. Registra `SessionCookieService` y `SessionBridgeWorkerComponent` en tu árbol DI exactamente igual que en la landing; de esta forma, cualquier iframe/worker podrá propagar la sesión.
3. Ajusta los valores de `cloud-settings.ts` sólo si tu juego vive en un dominio distinto; en tal caso agrega ese dominio a `returnAllowlist` y recalcula los `redirectUri`.
4. Importa el worker en la aplicación host vía `bootstrapApplication` o la configuración de `main.server.ts` cuando necesites exponer `/bridge.html`.
5. Verifica la cookie `atropello-session` desde el juego objetivo y usa `CloudSavesSessionBridgeService` (ya documentado en la sección anterior) para reenviar los tokens al SDK.

### Checklist para exponer el botón "Login" en TO³

1. **Reutiliza los servicios de autenticación** de la landing (`AuthService`, `AuthIntegrationService`, `AuthReturnService`, `SessionCookieService`). Si el proyecto TO³ es otra SPA Angular, importa la carpeta `src/app/services/auth*` junto con `settings/cloud-settings.ts`.
2. **Provee `CLOUD_SETTINGS`** con los mismos valores que usa la landing (region, Cognito IDs, callback URLs). Si TO³ vive en otro dominio, añade ese dominio a `returnAllowlist` para que el Hosted UI lo acepte.
3. **Renderiza el nuevo botón** en la UI de TO³ inyectando `AuthService`. Usa:
  ```ts
  constructor(private readonly auth: AuthService) {}

  login() { void this.auth.loginWithRedirect(window.location.href); }
  logout() { void this.auth.logoutWithRedirect(); }
  ```
  El `returnTo` asegura que, tras el login, Cognito redirija de vuelta a TO³.
4. **Escucha la identidad** con `auth.identity()` o `auth.displayName()` para mostrar al usuario activo.
5. **Propaga la sesión al bridge**: si TO³ se sirve desde un subdominio, incluye el iframe `/bridge.html` hospedado en `www.atropello-games.es` (ya lo hace `CloudSavesSessionBridgeService`) para compartir los tokens con otras propiedades.
6. **Verifica cookies**: asegúrate de que la cookie `atropello-session` (dominio `.atropello-games.es`) sea accesible desde el subdominio del juego; si no, revisa HTTPS + SameSite=None.

### Checklist para Saved Games en TO³

1. **Proveedores necesarios** (ejemplo):
  ```ts
  providers: [
    CloudSavesService,
    { provide: CLOUD_SAVES_SETTINGS, useValue: { apiBaseUrl: 'https://api.atropello-games.es/cloud-saves', mockLatencyMs: 0 } },
    { provide: CLOUD_SAVES_GAME_CONTEXT, useValue: { gameId: 'to3' } },
    { provide: CLOUD_SAVES_SESSION_BRIDGE, useExisting: CloudSavesSessionBridgeService }
  ]
  ```
2. **Botón "Manage saves" en TO³**: inyecta `CloudSavesService` directamente en la UI/controlador del juego y llama a `syncSlots()`, `loadSlot(index)`, `putSave(index, payload)` y `deleteSave(index)` según corresponda.
3. **Persistencia real**: tras llamar a `loadSlot` recibirás `{ index, key, savedAt, savegame }`; conecta `savegame` con tu serializer/deserializer interno.
4. **Flujos de error**: usa `saves.error()` para mostrar mensajes y `saves.loading()` para deshabilitar controles mientras se ejecutan peticiones.
5. **Testing manual**: crea un slot con "Save demo slot" desde la landing, abre TO³, pulsa el botón de login (debería aprovechar el mismo Hosted UI) y luego consume `loadSlot(0)` para comprobar que llega el mismo JSON.

### Identidad del jugador para headers remotos

- `CloudSavesSessionBridge` expone los métodos opcionales `getIdentity()` y `onIdentityChange()` que devuelven un objeto `UserIdentity` con los campos `displayName`, `nickname`, `preferredUsername`, `email` y `userId`.
- El bridge integrado (`CloudSavesSessionBridgeService`) propaga la identidad usando el claim `nickname` del ID Token y la replica en la cookie compartida/iframe, por lo que los juegos en subdominios pueden mostrar el mismo nombre que la landing.
- Si consumes el SDK fuera de Angular, replica el contrato leyendo la cookie `atropello-session` o escuchando `session:data` del iframe `/bridge.html`; la respuesta incluye `{ token, profile }`.

## Ejemplo mínimo de providers (standalone component)

```ts
@Component({
  selector: 'app-to3-cloud-panel',
  standalone: true,
  imports: [SavedGamesPanelComponent],
  providers: [
    {
      provide: CLOUD_SAVES_SETTINGS,
      useValue: {
        apiBaseUrl: 'https://api.atropello-games.es/cloud-saves',
        mockLatencyMs: 150
      }
    },
    {
      provide: CLOUD_SAVES_GAME_CONTEXT,
      useValue: { gameId: 'to3' }
    },
    {
      provide: CLOUD_SAVES_SESSION_BRIDGE,
      useExisting: CloudSavesSessionBridgeService
    }
  ]
})
export class To3CloudPanelComponent {}
```

## Contrato REST mínimamente requerido

| Método y ruta | Query params | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `GET /slots` | `gameId` obligatorio | — | `CloudSaveMasterFile` (si no existe `master.json`, retorna `saves: []`). |
| `PUT /slots/{index}` | `gameId` obligatorio | `{ "gameId": string, "savegame": unknown }` | `{ "status": "OK", "index": number, "savedAt": ISO8601 }` |
| `DELETE /slots/{index}` | `gameId` obligatorio | — | `{ "status": "DELETED", "index": number }` |

Cabeceras obligatorias: `Authorization: Bearer <ID Token Cognito>` + `Content-Type: application/json` para `PUT`. Errores devuelven `{ "error": string }` y códigos HTTP estándar (400 entrada inválida, 401/403 token errado, 500 errores S3).

## Buenas prácticas

- Firma todas las peticiones REST con el ID Token obtenido desde `CloudSavesSessionBridge` (ya inyectado en el servicio).
- Ajusta `mockLatencyMs` solo para simular escenarios reales; mantenlo en `0` en producción.
- Centraliza `apiBaseUrl` en `CloudSettings` para que múltiples componentes compartan la misma fuente y sea sencillo repuntar al entorno deseado.
- Ejecuta `npm run build` en la landing cada vez que actualices la carpeta para asegurar compatibilidad SSR antes de copiarla a otros repos.

## Próximos pasos

- Añadir ejemplo para consumidores no-Angular (ej. Unity WebGL) usando únicamente el cliente standalone.
- Publicar snippets `curl` con payloads reales para depuración manual del API Gateway.