import { Injectable } from '@angular/core';

export interface AuthSession {
  token: string;
  username: string;
  loginTime: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly SESSION_KEY = 'game.auth.session';
  private session: AuthSession | null = null;

  constructor() {
    this.loadSession();
  }

  /**
   * Verifica si el usuario está autenticado
   */
  public isAuthenticated(): boolean {
    return this.session !== null && !!this.session.token;
  }

  /**
   * Obtiene la sesión actual
   */
  public getSession(): AuthSession | null {
    return this.session ? { ...this.session } : null;
  }

  /**
   * Obtiene el username del usuario autenticado
   */
  public getUsername(): string | null {
    return this.session?.username || null;
  }

  /**
   * Establece una nueva sesión después de login exitoso
   */
  public setSession(token: string, username: string): void {
    this.session = {
      token,
      username,
      loginTime: Date.now()
    };
    this.saveSession();
  }

  /**
   * Cierra la sesión actual
   */
  public logout(): void {
    this.session = null;
    sessionStorage.removeItem(AuthService.SESSION_KEY);
  }

  /**
   * Carga la sesión desde sessionStorage
   */
  private loadSession(): void {
    try {
      const raw = sessionStorage.getItem(AuthService.SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.token && parsed.username) {
          this.session = parsed;
        }
      }
    } catch {
      // Ignorar errores de parseo
      this.session = null;
    }
  }

  /**
   * Guarda la sesión en sessionStorage
   */
  private saveSession(): void {
    try {
      if (this.session) {
        sessionStorage.setItem(AuthService.SESSION_KEY, JSON.stringify(this.session));
      }
    } catch {
      // Ignorar errores de storage
    }
  }
}
