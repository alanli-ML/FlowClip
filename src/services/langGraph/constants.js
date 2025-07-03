/**
 * Constants for LangGraph workflows
 */

// Allowed actions for content analysis
const ALLOWED_ACTIONS = [
  'research', 'fact_check', 'summarize', 'translate', 'explain', 'expand', 
  'create_task', 'cite', 'respond', 'schedule'
];

// Session types
const SESSION_TYPES = {
  HOTEL_RESEARCH: 'hotel_research',
  RESTAURANT_RESEARCH: 'restaurant_research',
  PRODUCT_RESEARCH: 'product_research',
  ACADEMIC_RESEARCH: 'academic_research',
  TRAVEL_RESEARCH: 'travel_research',
  GENERAL_RESEARCH: 'general_research'
};

// Comparison dimensions for different session types
const COMPARISON_DIMENSIONS = {
  [SESSION_TYPES.HOTEL_RESEARCH]: ['price', 'amenities', 'location', 'reviews'],
  [SESSION_TYPES.RESTAURANT_RESEARCH]: ['cuisine', 'price', 'atmosphere', 'reviews'],
  [SESSION_TYPES.PRODUCT_RESEARCH]: ['features', 'price', 'quality', 'reviews'],
  [SESSION_TYPES.ACADEMIC_RESEARCH]: ['relevance', 'authority', 'methodology'],
  [SESSION_TYPES.TRAVEL_RESEARCH]: ['cost', 'convenience', 'experience'],
  default: ['features', 'quality', 'value']
};

// Content types for analysis
const CONTENT_TYPES = {
  TEXT: 'text',
  URL: 'url',
  EMAIL: 'email',
  PHONE: 'phone',
  ADDRESS: 'address',
  LOCATION: 'location',
  PERSON: 'person',
  ORGANIZATION: 'organization',
  DATE: 'date',
  FINANCIAL: 'financial',
  CODE: 'code',
  DOCUMENT: 'document',
  DATA: 'data',
  EMPTY: 'empty'
};

// Entity relationship types
const ENTITY_RELATIONSHIP_TYPES = {
  SAME_ENTITY: 'SAME_ENTITY',
  COMPARABLE_ENTITIES: 'COMPARABLE_ENTITIES',
  COMPLEMENTARY_ENTITIES: 'COMPLEMENTARY_ENTITIES',
  INDEPENDENT_ENTITIES: 'INDEPENDENT_ENTITIES'
};

// Consolidation strategies
const CONSOLIDATION_STRATEGIES = {
  MERGE: 'MERGE',
  COMPARE: 'COMPARE',
  COMPLEMENT: 'COMPLEMENT',
  GENERIC: 'GENERIC'
};

// Cache settings
const CACHE_SETTINGS = {
  VISION_CACHE_MAX_AGE: 2 * 60 * 1000, // 2 minutes
  CACHE_CLEANUP_INTERVAL: 10 * 1000 // 10 seconds
};

// Model configurations
const MODEL_CONFIGS = {
  DEFAULT_MODEL: "gpt-3.5-turbo",
  VISION_MODEL: "gpt-4o",
  TEMPERATURE: 0.7
};

// Response format limits
const RESPONSE_LIMITS = {
  MAX_SUMMARY_LENGTH: 1800,
  MAX_SUMMARY_WORDS: 300,
  MAX_TAGS: 5,
  MAX_ACTIONS: 5,
  MAX_SOURCES: 10,
  MAX_FALLBACK_TAGS: 5
};

module.exports = {
  ALLOWED_ACTIONS,
  SESSION_TYPES,
  COMPARISON_DIMENSIONS,
  CONTENT_TYPES,
  ENTITY_RELATIONSHIP_TYPES,
  CONSOLIDATION_STRATEGIES,
  CACHE_SETTINGS,
  MODEL_CONFIGS,
  RESPONSE_LIMITS
}; 