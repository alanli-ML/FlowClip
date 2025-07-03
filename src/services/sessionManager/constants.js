/**
 * Constants for Session Manager
 */

// Session types
const SESSION_TYPES = {
  HOTEL_RESEARCH: 'hotel_research',
  RESTAURANT_RESEARCH: 'restaurant_research',
  PRODUCT_RESEARCH: 'product_research',
  ACADEMIC_RESEARCH: 'academic_research',
  TRAVEL_RESEARCH: 'travel_research',
  GENERAL_RESEARCH: 'general_research',
  EVENT_PLANNING: 'event_planning',
  PROJECT_RESEARCH: 'project_research'
};

// Session statuses
const SESSION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired'
};

// Browser applications
const BROWSER_APPS = [
  'Google Chrome', 
  'Safari', 
  'Firefox', 
  'Microsoft Edge', 
  'Arc'
];

// Research keyword categories
const RESEARCH_KEYWORDS = {
  HOTEL: [
    'hotel', 'resort', 'inn', 'suite', 'booking', 'marriott', 'hilton', 
    'hyatt', 'sheraton', 'ritz', 'four seasons', 'shangri'
  ],
  RESTAURANT: [
    'restaurant', 'menu', 'reservation', 'dining', 'cuisine', 'michelin', 'yelp'
  ],
  TRAVEL: [
    'flight', 'airline', 'airport', 'vacation', 'trip', 'travel', 'destination'
  ]
};

// Hotel brands for session labeling
const HOTEL_BRANDS = [
  'Hilton', 'Marriott', 'Hyatt', 'Sheraton', 'Ritz', 'Four Seasons', 
  'Shangri', 'Thompson', 'W Hotel', 'Westin', 'Renaissance'
];

// Major cities for location detection
const MAJOR_CITIES = [
  'Toronto', 'Montreal', 'Vancouver', 'New York', 'Los Angeles', 'Chicago', 
  'Boston', 'Austin', 'Miami', 'Seattle', 'Portland', 'Denver', 'Las Vegas',
  'London', 'Paris', 'Tokyo', 'Sydney', 'San Francisco', 'Washington', 
  'Atlanta', 'Dallas', 'Houston', 'Philadelphia', 'Phoenix'
];

// Cuisine types for restaurant categorization
const CUISINE_TYPES = [
  'Italian', 'French', 'Japanese', 'Chinese', 'Mexican', 'Thai', 
  'Indian', 'Mediterranean', 'Steakhouse'
];

// Event types for theme detection
const EVENT_TYPES = [
  'wedding', 'conference', 'meeting', 'vacation', 'trip', 'business trip', 
  'honeymoon', 'anniversary', 'birthday', 'graduation', 'interview', 'presentation'
];

// Project types for theme detection
const PROJECT_TYPES = [
  'website', 'app', 'presentation', 'report', 'proposal', 'research', 
  'analysis', 'study', 'design', 'development'
];

// Temporal keywords for timeframe detection
const TEMPORAL_KEYWORDS = [
  'next week', 'next month', 'this weekend', 'next weekend', 'december', 
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 
  'september', 'october', 'november', '2024', '2025'
];

// Complementary session types for cross-type matching
const COMPLEMENTARY_SESSION_TYPES = {
  [SESSION_TYPES.HOTEL_RESEARCH]: [
    SESSION_TYPES.RESTAURANT_RESEARCH, 
    SESSION_TYPES.TRAVEL_RESEARCH, 
    SESSION_TYPES.GENERAL_RESEARCH
  ],
  [SESSION_TYPES.RESTAURANT_RESEARCH]: [
    SESSION_TYPES.HOTEL_RESEARCH, 
    SESSION_TYPES.TRAVEL_RESEARCH, 
    SESSION_TYPES.GENERAL_RESEARCH
  ],
  [SESSION_TYPES.TRAVEL_RESEARCH]: [
    SESSION_TYPES.HOTEL_RESEARCH, 
    SESSION_TYPES.RESTAURANT_RESEARCH, 
    SESSION_TYPES.GENERAL_RESEARCH
  ],
  [SESSION_TYPES.PRODUCT_RESEARCH]: [SESSION_TYPES.GENERAL_RESEARCH],
  [SESSION_TYPES.ACADEMIC_RESEARCH]: [SESSION_TYPES.GENERAL_RESEARCH]
};

// Session label templates
const SESSION_LABEL_TEMPLATES = {
  [SESSION_TYPES.HOTEL_RESEARCH]: 'Hotel Research',
  [SESSION_TYPES.RESTAURANT_RESEARCH]: 'Restaurant Research',
  [SESSION_TYPES.PRODUCT_RESEARCH]: 'Product Research',
  [SESSION_TYPES.ACADEMIC_RESEARCH]: 'Academic Research',
  [SESSION_TYPES.GENERAL_RESEARCH]: 'Research Session',
  [SESSION_TYPES.TRAVEL_RESEARCH]: 'Travel Research',
  [SESSION_TYPES.EVENT_PLANNING]: 'Event Planning',
  [SESSION_TYPES.PROJECT_RESEARCH]: 'Project Research'
};

// Timing configurations
const TIMING_CONFIG = {
  SESSION_TIMEOUT: 60 * 60 * 1000, // 1 hour
  CLEANUP_INTERVAL: 60 * 1000, // 1 minute
  THEME_MATCHING_WINDOW: 2 * 60 * 60 * 1000 // 2 hours
};

// Common words to filter out from session labels
const COMMON_WORDS_FILTER = [
  'Hotel', 'Resort', 'Restaurant', 'The', 'And', 'For', 'With', 'About', 
  'This', 'That', 'From', 'Your', 'Our'
];

// Content type detection patterns
const CONTENT_PATTERNS = {
  URL: /^https?:\/\//,
  EMAIL: /\S+@\S+\.\S+/,
  PHONE: /(\+?1-?)?(\d{3}[-.]?)?\d{3}[-.]?\d{4}|\(\d{3}\)\s?\d{3}[-.]?\d{4}/,
  DATE: /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}-\d{2}-\d{2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s+\d{4}/i,
  LOCATION: /\b(city|town|village|county|state|country|province|region)\b/i,
  BUSINESS: /\b[A-Z][a-z]+ (hotel|restaurant|resort|inn|suites|lodge|cafe|bistro|grill|bar|pub|store|shop|market|center|mall|plaza|tower|building|company|corporation|inc|llc|ltd)\b/i
};

// Progress status types
const PROGRESS_STATUS = {
  JUST_STARTED: 'just_started',
  GATHERING_INFORMATION: 'gathering_information',
  COMPARING_OPTIONS: 'comparing_options',
  READY_TO_DECIDE: 'ready_to_decide',
  IN_PROGRESS: 'in_progress'
};

module.exports = {
  SESSION_TYPES,
  SESSION_STATUS,
  BROWSER_APPS,
  RESEARCH_KEYWORDS,
  HOTEL_BRANDS,
  MAJOR_CITIES,
  CUISINE_TYPES,
  EVENT_TYPES,
  PROJECT_TYPES,
  TEMPORAL_KEYWORDS,
  COMPLEMENTARY_SESSION_TYPES,
  SESSION_LABEL_TEMPLATES,
  TIMING_CONFIG,
  COMMON_WORDS_FILTER,
  CONTENT_PATTERNS,
  PROGRESS_STATUS
}; 