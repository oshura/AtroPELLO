import { TargetType } from './targeting.types';

/**
 * Enumeración de tipos de GameObjects en el juego.
 * Fuente única de verdad para identificar el tipo de un objeto espacial.
 * 
 * Nota: Pueden existir múltiples clases con el mismo tipo.
 * Ej: Diferentes naves (distintas geometrías/shaders) comparten GO_TYPE.SPACESHIP
 */
export enum GameObjectType {
  // Objetos desconocidos o sin clasificar
  UNKNOWN = 'UNKNOWN',
  
  // Naves espaciales
  SPACESHIP = 'SPACESHIP',
  LESSER_BEING = 'LESSER_BEING',
  
  // Asteroides (tamaños variados)
  ASTEROID = 'ASTEROID',
  SUPER_ASTEROID = 'SUPER_ASTEROID',
  MEGA_ASTEROID = 'MEGA_ASTEROID',
  
  // Clusters de asteroides
  CLUSTER = 'CLUSTER',
  
  // Planetas (tipos variados)
  PLANET = 'PLANET',
  DWARF_PLANET = 'DWARF_PLANET',
  PROTOPLANET = 'PROTOPLANET',
  GIANT_PLANET = 'GIANT_PLANET',
  GASEOUS_PLANET = 'GASEOUS_PLANET',
  RINGED_PLANET = 'RINGED_PLANET',
  EARTH_SPLIT_PLANET = 'EARTH_SPLIT_PLANET',
  
  // Estrellas
  SUN = 'SUN',

  // Portales
  PORTAL = 'PORTAL',

  // Estaciones espaciales (modelo master heredable; el diseño lo da la subclase por raza)
  SPACE_STATION = 'SPACE_STATION',
  // Puerto de atraque (la "tile" de acople; reutilizable en cualquier objeto del espacio)
  DOCK_PORT = 'DOCK_PORT'
}

/**
 * Categorías de GameObjects para lógica de colisiones y física.
 * Agrupa tipos similares para facilitar comparaciones.
 */
export enum GameObjectCategory {
  SHIP = 'SHIP',
  ASTEROID = 'ASTEROID',
  PLANET = 'PLANET',
  STAR = 'STAR',
  PORTAL = 'PORTAL',
  CLUSTER = 'CLUSTER',
  ENEMY = 'ENEMY',
  STATION = 'STATION',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Tamaños de GameObjects para física de colisiones.
 * Determina comportamiento físico (inercia, respuesta a impulsos, etc.)
 */
export enum GameObjectSize {
  SMALL = 'SMALL',      // Asteroides pequeños, clusters - Móviles, afectados por colisiones
  MEDIUM = 'MEDIUM',    // Super asteroides - Móviles pero pesados
  LARGE = 'LARGE',      // Mega asteroides - Muy pesados, difíciles de mover
  MASSIVE = 'MASSIVE',  // Planetas, sol - Prácticamente inmóviles
  ETHEREAL = 'ETHEREAL' // Portales, objetos sin masa física
}

/**
 * Mapa de tipo a categoría para facilitar consultas
 */
export const TYPE_TO_CATEGORY: Record<GameObjectType, GameObjectCategory> = {
  [GameObjectType.UNKNOWN]: GameObjectCategory.UNKNOWN,
  [GameObjectType.SPACESHIP]: GameObjectCategory.SHIP,
  [GameObjectType.LESSER_BEING]: GameObjectCategory.ENEMY,
  [GameObjectType.ASTEROID]: GameObjectCategory.ASTEROID,
  [GameObjectType.SUPER_ASTEROID]: GameObjectCategory.ASTEROID,
  [GameObjectType.MEGA_ASTEROID]: GameObjectCategory.ASTEROID,
  [GameObjectType.CLUSTER]: GameObjectCategory.CLUSTER,
  [GameObjectType.PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.DWARF_PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.PROTOPLANET]: GameObjectCategory.PLANET,
  [GameObjectType.GIANT_PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.GASEOUS_PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.RINGED_PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.EARTH_SPLIT_PLANET]: GameObjectCategory.PLANET,
  [GameObjectType.SUN]: GameObjectCategory.STAR,
  [GameObjectType.PORTAL]: GameObjectCategory.PORTAL,
  [GameObjectType.SPACE_STATION]: GameObjectCategory.STATION,
  [GameObjectType.DOCK_PORT]: GameObjectCategory.STATION
};

/**
 * Mapa de tipo a tamaño físico para física de colisiones
 */
export const TYPE_TO_SIZE: Record<GameObjectType, GameObjectSize> = {
  [GameObjectType.UNKNOWN]: GameObjectSize.SMALL,
  [GameObjectType.SPACESHIP]: GameObjectSize.SMALL,
  [GameObjectType.LESSER_BEING]: GameObjectSize.SMALL,
  [GameObjectType.ASTEROID]: GameObjectSize.SMALL,
  [GameObjectType.CLUSTER]: GameObjectSize.SMALL,
  [GameObjectType.SUPER_ASTEROID]: GameObjectSize.MEDIUM,
  [GameObjectType.MEGA_ASTEROID]: GameObjectSize.LARGE,
  [GameObjectType.PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.DWARF_PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.PROTOPLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.GIANT_PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.GASEOUS_PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.RINGED_PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.EARTH_SPLIT_PLANET]: GameObjectSize.MASSIVE,
  [GameObjectType.SUN]: GameObjectSize.MASSIVE,
  [GameObjectType.PORTAL]: GameObjectSize.ETHEREAL,
  [GameObjectType.SPACE_STATION]: GameObjectSize.MASSIVE,
  [GameObjectType.DOCK_PORT]: GameObjectSize.ETHEREAL
};

/**
 * Verifica si un tipo pertenece a una categoría
 */
export function isCategory(type: GameObjectType, category: GameObjectCategory): boolean {
  return TYPE_TO_CATEGORY[type] === category;
}

/**
 * Obtiene la categoría de un tipo
 */
export function getCategory(type: GameObjectType): GameObjectCategory {
  return TYPE_TO_CATEGORY[type] || GameObjectCategory.UNKNOWN;
}

/**
 * Obtiene el tamaño físico de un tipo (para física de colisiones)
 */
export function getPhysicsSize(type: GameObjectType): GameObjectSize {
  return TYPE_TO_SIZE[type] || GameObjectSize.SMALL;
}

/**
 * Obtiene un label legible para display UI de un GameObjectType
 * Usado en HUD, outliner, target panels, etc.
 */
export function getDisplayLabel(type: GameObjectType): string {
  switch (type) {
    case GameObjectType.SPACESHIP: return 'Spaceship';
    case GameObjectType.LESSER_BEING: return 'Lesser Being';
    case GameObjectType.ASTEROID: return 'Asteroid';
    case GameObjectType.SUPER_ASTEROID: return 'SuperAsteroid';
    case GameObjectType.MEGA_ASTEROID: return 'MegaAsteroid';
    case GameObjectType.CLUSTER: return 'Cluster';
    case GameObjectType.PLANET: return 'Planet';
    case GameObjectType.DWARF_PLANET: return 'Dwarf Planet';
    case GameObjectType.PROTOPLANET: return 'Protoplanet';
    case GameObjectType.GIANT_PLANET: return 'Giant Planet';
    case GameObjectType.GASEOUS_PLANET: return 'Gaseous Planet';
    case GameObjectType.RINGED_PLANET: return 'Ringed Planet';
    case GameObjectType.EARTH_SPLIT_PLANET: return 'Earth';
    case GameObjectType.SUN: return 'Sun';
    case GameObjectType.PORTAL: return 'Portal';
    case GameObjectType.SPACE_STATION: return 'Space Station';
    case GameObjectType.DOCK_PORT: return 'Puerto espacial';
    case GameObjectType.UNKNOWN: return 'Unknown';
    default: return 'Unknown';
  }
}

/**
 * Obtiene un icono/símbolo para UI compacta (mapa, filtros)
 */
export function getDisplayIcon(type: GameObjectType): string {
  const category = getCategory(type);
  switch (category) {
    case GameObjectCategory.STAR: return '☀';
    case GameObjectCategory.PLANET: return '●';
    case GameObjectCategory.ASTEROID: return '▪';
    case GameObjectCategory.CLUSTER: return '◈';
    case GameObjectCategory.SHIP: return '▲';
    case GameObjectCategory.ENEMY: return '✖';
    case GameObjectCategory.PORTAL: return '◉';
    case GameObjectCategory.STATION: return '⬡';
    default: return '?';
  }
}

/**
 * Obtiene un icono específico para categoría (usado en filtros del mapa)
 */
export function getCategoryIcon(category: GameObjectCategory): string {
  switch (category) {
    case GameObjectCategory.STAR: return '*';
    case GameObjectCategory.PLANET: return 'P';
    case GameObjectCategory.ASTEROID: return 'D'; // "Debris"
    case GameObjectCategory.CLUSTER: return 'C';
    case GameObjectCategory.SHIP: return 'S';
    case GameObjectCategory.PORTAL: return 'Po';
    case GameObjectCategory.ENEMY: return 'E';
    case GameObjectCategory.STATION: return 'Es';
    default: return '?';
  }
}

/**
 * Convierte TargetType (usado en targeting) a GameObjectType (sistema principal)
 * Permite usar getDisplayLabel() con datos del sistema de targeting
 */
export function targetTypeToGameObjectType(targetType: TargetType): GameObjectType {
  switch (targetType) {
    case TargetType.SPACESHIP: return GameObjectType.SPACESHIP;
    case TargetType.ASTEROID: return GameObjectType.ASTEROID;
    case TargetType.SUPER_ASTEROID: return GameObjectType.SUPER_ASTEROID;
    case TargetType.MEGA_ASTEROID: return GameObjectType.MEGA_ASTEROID;
    case TargetType.CLUSTER: return GameObjectType.CLUSTER;
    case TargetType.PLANET: return GameObjectType.PLANET;
    case TargetType.SUN: return GameObjectType.SUN;
    case TargetType.PORTAL: return GameObjectType.PORTAL;
    case TargetType.SPACE_STATION: return GameObjectType.SPACE_STATION;
    case TargetType.DOCK_PORT: return GameObjectType.DOCK_PORT;
    case TargetType.WAYPOINT:
    case TargetType.UNKNOWN:
    default: return GameObjectType.UNKNOWN;
  }
}

/**
 * Helper para obtener label display desde TargetType directamente
 */
export function getDisplayLabelFromTargetType(targetType: TargetType): string {
  return getDisplayLabel(targetTypeToGameObjectType(targetType));
}

/**
 * Label de tipo para el panel de target del HUD: variantes cortas para subtipos específicos
 * (asteroides grandes, planetas especiales) y el label estándar del TargetType para el resto.
 * Único punto de verdad (antes duplicado en dos switches del GameEngine).
 */
export function getSpecificDisplayLabel(objectType: GameObjectType, targetType: TargetType): string {
  switch (objectType) {
    case GameObjectType.MEGA_ASTEROID: return 'MegaAsteroid';
    case GameObjectType.SUPER_ASTEROID: return 'SuperAsteroid';
    case GameObjectType.RINGED_PLANET: return 'Ringed';
    case GameObjectType.DWARF_PLANET: return 'Dwarf';
    case GameObjectType.PROTOPLANET: return 'Protoplanet';
    default: return getDisplayLabelFromTargetType(targetType);
  }
}

