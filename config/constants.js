/**
 * Application Constants
 * Contains event types, venues, user roles, and other static data
 */

// User Roles
const USER_ROLES = {
  ADMIN: 'admin',
  SERVICE_PROVIDER: 'service_provider',
  CLIENT: 'client',
  VENDOR: 'vendor',
};

// User Types (Service Providers)
const SERVICE_PROVIDER_TYPES = [
  'event_planner',
  'event_planner_and_manager',
  'events_services_provider_and_vendor',
  'events_facilitator_and_agent',
  'special_events_host_and_organizer',
  'events_venue_owner_and_manager',
  'venue_decorator',
  'makeup_artist',
  'usher',
  'bouncer',
  'events_facilities_rental_and_hiring_company',
  'ice_chilling_services',
  'refrigerated_vans_provider',
  'food_caterer',
  'drinks_supplier',
  'music_dj_and_live_performance',
  'mc_and_compares',
  'comedian_and_entertainer',
  'event_manager',
  'events_service_provider',
  'events_facilitator',
  'events_agent',
  'special_events_host',
  'events_organizer',
  'venue_owner',
  'venue_manager',
  'dj',
  'live_performance',
  'mc_compare',
  'comedian_entertainer',
];

// Event Types
const EVENT_TYPES = {
  CELEBRATORY: [
    'birthday_party',
    'wedding',
    'traditional_marriage',
    'anniversary',
    'baby_shower',
    'bridal_shower',
    'graduation_party',
    'naming_ceremony',
    'thanksgiving_party',
    'cocktail_party',
  ],
  FAREWELL: [
    'funeral',
    'burial_ceremony',
    'memorial_service',
    'service_of_songs',
    'wake_for_departed',
  ],
  FORMAL_PROFESSIONAL: [
    'conference',
    'seminar',
    'workshop',
    'business_meeting',
    'product_launch',
    'award_ceremony',
    'networking_event',
  ],
  COMMUNITY_CULTURAL: [
    'festival',
    'carnival',
    'cultural_day',
    'religious_gathering',
    'church_program',
    'town_hall_meeting',
  ],
  ENTERTAINMENT_LEISURE: [
    'concert',
    'movie_night',
    'theatre_performance',
    'comedy_show',
    'game_night',
    'club_party',
  ],
  SPORTS_COMPETITIVE: [
    'football_match',
    'athletic_competition',
    'marathon',
    'school_sports_day',
    'sports_tournament',
  ],
  EDUCATIONAL: [
    'lecture',
    'training_program',
    'academic_symposium',
    'career_fair',
  ],
  SOCIAL_SUPPORT_WELFARE: [
    'charity_event',
    'fundraiser',
    'volunteer_outreach',
  ],
};

// Nigerian States with LGAs and Communities
const NIGERIAN_LOCATIONS = {
  ABIA: {
    lgas: [
      'Aba North',
      'Aba South',
      'Arochukwu',
      'Bende',
      'Ikwuano',
      'Isiala Ngwa North',
      'Isiala Ngwa South',
      'Isuikwuato',
      'Obi Ngwa',
      'Ohafia',
      'Osisioma Ngwa',
      'Ugwunagbo',
      'Ukwa East',
      'Ukwa West',
      'Umuahia North',
      'Umuahia South',
      'Umunneochi',
    ],
    communities: [
      'Aba',
      'Ohafia',
      'Arochukwu',
      'Bende',
      'Umuahia',
      'Ikot Ekpene',
    ],
  },
  ANAMBRA: {
    lgas: [
      'Aguata',
      'Anambra East',
      'Anambra West',
      'Anaocha',
      'Awka North',
      'Awka South',
      'Ayamelum',
      'Dunukofia',
      'Ekwusigo',
      'Idemili North',
      'Idemili South',
      'Ihiala',
      'Njikoka',
      'Nnewi North',
      'Nnewi South',
      'Ogbaru',
      'Onitsha North',
      'Onitsha South',
      'Orumba North',
      'Orumba South',
      'Oyi',
    ],
    communities: [
      'Awka',
      'Onitsha',
      'Nnewi',
      'Enugu-Ukwu',
      'Agulu',
      'Ihiala',
    ],
  },
  EBONYI: {
    lgas: [
      'Afikpo North',
      'Afikpo South',
      'Ebonyi',
      'Ezza North',
      'Ezza South',
      'Ikwo',
      'Ishielu',
      'Isy-Uzo',
      'Izzi',
      'Ohaozara',
      'Ohaukwu',
      'Onicha',
    ],
    communities: [
      'Abakaliki',
      'Afikpo',
      'Ezza',
      'Ikwo',
      'Isiagu',
      'Ohaozara',
    ],
  },
  ENUGU: {
    lgas: [
      'Aninri',
      'Awgu',
      'Enugu East',
      'Enugu North',
      'Enugu South',
      'Ezeagu',
      'Igbo Etiti',
      'Igbo-Eze North',
      'Igbo-Eze South',
      'Isi-Uzo',
      'Iterate',
      'Nkanu East',
      'Nkanu West',
      'Nsukka',
      'Oji River',
      'Udenu',
      'Uzo-Uwani',
    ],
    communities: [
      'Enugu',
      'Nsukka',
      'Oji River',
      'Aninri',
      'Awgu',
      'Iterate',
    ],
  },
  IMO: {
    lgas: [
      'Aboh Mbaise',
      'Ahiazu Mbaise',
      'Ejemekwolu',
      'Ehime Mbano',
      'Eleme',
      'Ezinihitte Mbaise',
      'Ideato North',
      'Ideato South',
      'Igbo-Eze',
      'Ikeduru',
      'Ikwerre',
      'Imoko',
      'Isiala Mbano',
      'Isimangу',
      'Isu',
      'Izzi',
      'Mbaitoli',
      'Ngor-Okpala',
      'Njaba',
      'Nkwerre',
      'Obowo',
      'Oguta',
      'Ohaji Egbema',
      'Okigwe',
      'Okologbo',
      'Owerri Municipal',
      'Owerri North',
      'Owerri West',
      'Onuimo',
      'Orlu',
      'Orokcham',
      'Orsu',
      'Oru East',
      'Oru West',
      'Otop',
      'Unuimo',
    ],
    communities: [
      'Owerri',
      'Orlu',
      'Okigwe',
      'Isiala Mbano',
      'Mbaitoli',
      'Ideato',
    ],
  },
};

// Payment Plan
const PAYMENT_PLAN = {
  FULL: 'full',
  SPLIT_50_50: 'split_50_50',
  DEPOSIT_20: 'deposit_20',
};

// Reschedule Status
const RESCHEDULE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
};

// Refund Status
const REFUND_STATUS = {
  NONE: 'none',
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
};

// Payment Status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

// Booking Status
const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

// Rating Limits
const RATING_LIMITS = {
  MIN: 1,
  MAX: 5,
};

module.exports = {
  USER_ROLES,
  SERVICE_PROVIDER_TYPES,
  EVENT_TYPES,
  NIGERIAN_LOCATIONS,
  PAYMENT_STATUS,
  PAYMENT_PLAN,
  BOOKING_STATUS,
  RESCHEDULE_STATUS,
  REFUND_STATUS,
  RATING_LIMITS,
};
