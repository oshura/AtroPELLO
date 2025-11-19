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
  PORTAL = 'PORTAL'
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
  UNKNOWN = 'UNKNOWN'
}

/**
 * Mapa de tipo a categoría para facilitar consultas
 */
export const TYPE_TO_CATEGORY: Record<GameObjectType, GameObjectCategory> = {
  [GameObjectType.UNKNOWN]: GameObjectCategory.UNKNOWN,
  [GameObjectType.SPACESHIP]: GameObjectCategory.SHIP,
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
  [GameObjectType.PORTAL]: GameObjectCategory.PORTAL
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
