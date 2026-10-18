import { BusinessNiche } from '../types';

export interface CategorySpec {
  id: BusinessNiche;
  label: string;
  group: 'Commerce' | 'Food & Hospitality' | 'Property & Construction' | 'Health & Personal Care' | 'Professional Services' | 'Flexible Categories';
  shortDesc: string;
  iconName: string;
  itemTypeLabel: string; // e.g. "Products", "Properties", "Menu Items", "Projects", "Services"
  defaultItems: Array<{
    name: string;
    price: string;
    description: string;
    tag?: string;
  }>;
  customFields: Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    placeholder?: string;
    options?: string[];
    required?: boolean;
    defaultValue?: string;
  }>;
  primaryCtaOptions: string[];
  secondaryCtaOptions: string[];
}

export const CATEGORY_SPECS: CategorySpec[] = [
  // --- Commerce ---
  {
    id: 'ecommerce',
    label: 'E-commerce & Online Store',
    group: 'Commerce',
    shortDesc: 'Digital catalog with instant Cash on Delivery order forms and product categorization.',
    iconName: 'Store',
    itemTypeLabel: 'Products',
    defaultItems: [
      { name: 'Monochrome Premium Oxford Shirt', price: '৳1,850', description: 'Combed Egyptian breathable cotton, sizes M, L, XL.' },
      { name: 'Minimalist Automatic Watch', price: '৳4,200', description: 'Brushed surgical steel case with sapphire crystal dial.' },
    ],
    customFields: [
      { key: 'deliveryFeeInsideDhaka', label: 'Delivery Fee (Inside Dhaka)', type: 'text', placeholder: 'e.g. ৳80 (24-48 hrs)', defaultValue: '৳80' },
      { key: 'deliveryFeeOutsideDhaka', label: 'Delivery Fee (Outside Dhaka)', type: 'text', placeholder: 'e.g. ৳130 (2-3 days)', defaultValue: '৳130' },
      { key: 'returnPolicySummary', label: 'Exchange & Return Terms', type: 'text', placeholder: 'e.g. 7-Day Hassle-Free Size Exchange' },
    ],
    primaryCtaOptions: ['Shop Now', 'View Catalog', 'Order on WhatsApp', 'Browse Best Sellers'],
    secondaryCtaOptions: ['Call Support', 'Track Order', 'Contact Us'],
  },
  {
    id: 'fashion',
    label: 'Fashion & Clothing Boutique',
    group: 'Commerce',
    shortDesc: 'Editorial lookbooks, size charts, seasonal collections, and trending drops.',
    iconName: 'Shirt',
    itemTypeLabel: 'Apparel Items',
    defaultItems: [
      { name: 'Tailored Linen Blazer', price: '৳3,450', description: 'Lightweight summer formal cut with contrast horn buttons.' },
      { name: 'Pure Silk Festive Kurti', price: '৳2,800', description: 'Hand-embroidered zari neckline with matching palazzo.' },
    ],
    customFields: [
      { key: 'sizeRange', label: 'Available Sizes', type: 'text', placeholder: 'e.g. XS, S, M, L, XL, XXL', defaultValue: 'S, M, L, XL' },
      { key: 'fabricHighlights', label: 'Fabric & Material Guarantee', type: 'text', placeholder: 'e.g. 100% Pure Organic Linen & Silk' },
    ],
    primaryCtaOptions: ['Explore Collection', 'Shop New Arrivals', 'Order via WhatsApp'],
    secondaryCtaOptions: ['View Size Guide', 'Contact Stylist'],
  },

  // --- Food & Hospitality ---
  {
    id: 'restaurant',
    label: 'Restaurant & Dining',
    group: 'Food & Hospitality',
    shortDesc: 'Appetizing menus, chef specials, table reservation requests, and delivery details.',
    iconName: 'Utensils',
    itemTypeLabel: 'Menu Items',
    defaultItems: [
      { name: 'Chef Special Dum Biryani', price: '৳550', description: 'Slow-cooked fragrant chinigura rice with spiced tender meat.' },
      { name: 'Charcoal Grilled Kebab Platter', price: '৳720', description: 'Assorted chicken tikka, mutton seekh with garlic naan.' },
    ],
    customFields: [
      { key: 'cuisineType', label: 'Cuisine Specialties', type: 'text', placeholder: 'e.g. Traditional Mughlai, Continental, BBQ', defaultValue: 'Continental & BBQ' },
      { key: 'openingHours', label: 'Operating Hours', type: 'text', placeholder: 'e.g. 12:00 PM – 11:30 PM (Daily)', defaultValue: '12:00 PM – 11:00 PM' },
      { key: 'deliveryAvailable', label: 'Home Delivery Status', type: 'text', placeholder: 'e.g. Available via Foodpanda or Direct WhatsApp', defaultValue: 'Direct Delivery & Takeaway Available' },
    ],
    primaryCtaOptions: ['View Menu', 'Order on WhatsApp', 'Reserve a Table', 'Call Restaurant'],
    secondaryCtaOptions: ['Get Directions', 'Inquire for Catering'],
  },
  {
    id: 'cafe',
    label: 'Café & Bakery',
    group: 'Food & Hospitality',
    shortDesc: 'Specialty coffee beans, fresh artisanal pastries, and cozy ambiance highlights.',
    iconName: 'Coffee',
    itemTypeLabel: 'Beverages & Pastries',
    defaultItems: [
      { name: 'Single Origin Pour-Over Coffee', price: '৳380', description: 'Freshly roasted high-altitude beans with citrus notes.' },
      { name: 'French Almond Croissant', price: '৳280', description: 'Flaky double-baked croissant filled with almond frangipane.' },
    ],
    customFields: [
      { key: 'roastStyle', label: 'Coffee Beans & Roasting', type: 'text', placeholder: 'e.g. Arabica 100%, Medium Roast', defaultValue: 'Specialty Grade 100% Arabica' },
      { key: 'seatingCapacity', label: 'Co-Working & Wi-Fi Facilities', type: 'text', placeholder: 'e.g. High-Speed Wi-Fi & Power Outlets Available' },
    ],
    primaryCtaOptions: ['View Drink Menu', 'Order Ahead', 'WhatsApp Us'],
    secondaryCtaOptions: ['Location & Hours', 'Find Table'],
  },

  // --- Property & Construction ---
  {
    id: 'real_estate',
    label: 'Real Estate & Properties',
    group: 'Property & Construction',
    shortDesc: 'Property listings, luxury apartments, commercial leases, and agent contact.',
    iconName: 'Home',
    itemTypeLabel: 'Properties & Listings',
    defaultItems: [
      { name: 'Luxury 3-Bed Gulshan Residence', price: '৳3.8 Cr', description: '2,400 sqft apartment, 3 attached baths, 2 parking spots, panoramic lake view.' },
      { name: 'Commercial Corporate Floor Banani', price: '৳1.8L/mo', description: '1,800 sqft fully plug-and-play modern corporate office suite.' },
    ],
    customFields: [
      { key: 'propertyTypeFilter', label: 'Property Focus', type: 'text', placeholder: 'e.g. Residential Apartments, Commercial Towers, Land Plots', defaultValue: 'Luxury Residential & Commercial' },
      { key: 'licenseNumber', label: 'REHAB / Official Registration', type: 'text', placeholder: 'e.g. REHAB Member #1084' },
    ],
    primaryCtaOptions: ['View Properties', 'Book a Site Visit', 'Contact Agent on WhatsApp', 'Request Floor Plan'],
    secondaryCtaOptions: ['Call Hotline', 'Download Brochure'],
  },
  {
    id: 'architecture',
    label: 'Architecture & Interior Design',
    group: 'Property & Construction',
    shortDesc: 'Visual portfolio of residential transformations, modern interiors, and commercial spaces.',
    iconName: 'Compass',
    itemTypeLabel: 'Featured Projects',
    defaultItems: [
      { name: 'Nordic Minimalist Duplex Penthouse', price: 'Turnkey Project', description: 'Full interior architecture, bespoke walnut woodwork, and smart circadian lighting.' },
      { name: 'Urban Tech Headquarters Banani', price: 'Corporate Architecture', description: '6,000 sqft biophilic workspace with acoustic phone pods and collaborative lounges.' },
    ],
    customFields: [
      { key: 'studioSpecialty', label: 'Design Specialization', type: 'text', placeholder: 'e.g. Residential Interior, Commercial Architecture, Landscape', defaultValue: 'Contemporary Residential & Modern Interiors' },
      { key: 'consultationTerms', label: 'Consultation Policy', type: 'text', placeholder: 'e.g. Free 30-min discovery session' },
    ],
    primaryCtaOptions: ['Explore Portfolio', 'Book a Consultation', 'WhatsApp Architect', 'Request Quote'],
    secondaryCtaOptions: ['View Projects', 'Our Process'],
  },

  // --- Health & Personal Care ---
  {
    id: 'clinic',
    label: 'Medical & Dental Clinic',
    group: 'Health & Personal Care',
    shortDesc: 'Specialized healthcare, doctor credentials, department facilities, and appointment bookings.',
    iconName: 'Stethoscope',
    itemTypeLabel: 'Clinical Services',
    defaultItems: [
      { name: 'Comprehensive Dental Health Checkup', price: '৳1,200', description: 'Digital X-ray imaging, ultrasonic scaling, and personalized preventive care plan.' },
      { name: 'Specialist Consultation & Diagnosis', price: '৳1,500', description: 'Senior consultant examination with detailed treatment protocol.' },
    ],
    customFields: [
      { key: 'visitingHours', label: 'Doctor Visiting Hours', type: 'text', placeholder: 'e.g. Sat–Thu: 4:00 PM – 9:00 PM', defaultValue: '5:00 PM – 9:30 PM (Sat–Thu)' },
      { key: 'emergencyContact', label: 'Emergency Hotline', type: 'text', placeholder: 'e.g. +880 1811-000000' },
    ],
    primaryCtaOptions: ['Book an Appointment', 'WhatsApp Clinic', 'Call Doctor Hotline'],
    secondaryCtaOptions: ['Explore Services', 'Our Specialists'],
  },
  {
    id: 'salon',
    label: 'Beauty Salon, Spa & Parlour',
    group: 'Health & Personal Care',
    shortDesc: 'Hair styling, organic facials, bridal packages, and relaxing wellness treatments.',
    iconName: 'Scissors',
    itemTypeLabel: 'Treatment Packages',
    defaultItems: [
      { name: 'Signature Moroccan Hair Spa', price: '৳2,400', description: 'Argan oil deep conditioning treatment, hot towel wrap, and relaxing scalp massage.' },
      { name: 'Bridal Makeover & Glow Package', price: '৳12,000', description: 'HD bridal makeup, hair styling, skin prep, and premium draping.' },
    ],
    customFields: [
      { key: 'appointmentOnly', label: 'Booking Policy', type: 'text', placeholder: 'e.g. By Appointment Only / Walk-ins Welcome', defaultValue: 'Appointments & Walk-ins Welcome' },
      { key: 'serviceFor', label: 'Clientele', type: 'text', placeholder: 'e.g. Women Only, Unisex Studio', defaultValue: 'Women Only' },
    ],
    primaryCtaOptions: ['Book an Appointment', 'WhatsApp Us', 'View Rate Card'],
    secondaryCtaOptions: ['Call Salon', 'Bridal Inquiries'],
  },
  {
    id: 'gym',
    label: 'Gym & Fitness Studio',
    group: 'Health & Personal Care',
    shortDesc: 'Strength equipment, personal training packages, crossfit sessions, and nutrition plans.',
    iconName: 'Dumbbell',
    itemTypeLabel: 'Membership Plans',
    defaultItems: [
      { name: 'Monthly All-Access Fitness Pass', price: '৳3,500/mo', description: 'Full access to state-of-the-art strength machines, cardio deck, and sauna.' },
      { name: '1-on-1 Personal Training (12 Sessions)', price: '৳12,000', description: 'Custom body composition tracking, personalized workouts, and meal plan.' },
    ],
    customFields: [
      { key: 'gymTiming', label: 'Operating Timings', type: 'text', placeholder: 'e.g. 6:00 AM – 11:00 PM (Separate Women Hours 11AM-2PM)', defaultValue: '6:00 AM – 11:00 PM Daily' },
    ],
    primaryCtaOptions: ['Start 1-Day Free Trial', 'WhatsApp Trainer', 'Join Membership'],
    secondaryCtaOptions: ['Explore Facilities', 'View Timings'],
  },

  // --- Professional Services ---
  {
    id: 'agency',
    label: 'Creative & Digital Agency',
    group: 'Professional Services',
    shortDesc: 'Web engineering, brand identity, performance marketing, and creative production.',
    iconName: 'Briefcase',
    itemTypeLabel: 'Service Solutions',
    defaultItems: [
      { name: 'End-to-End Brand Identity Architecture', price: '৳35,000', description: 'Logo design, typography guides, digital asset toolkit, and brand strategy deck.' },
      { name: 'Performance Growth Ad Campaigns', price: '৳20,000/mo', description: 'Full-funnel Meta & Google Ads optimization, pixel setup, and weekly analytics.' },
    ],
    customFields: [
      { key: 'clienteleNiche', label: 'Core Agency Focus', type: 'text', placeholder: 'e.g. B2B SaaS, E-Commerce Brands, Corporate', defaultValue: 'E-Commerce Brands & Growth Businesses' },
    ],
    primaryCtaOptions: ['Get a Proposal', 'Book a Strategy Call', 'WhatsApp Agency', 'View Case Studies'],
    secondaryCtaOptions: ['Explore Services', 'Our Work'],
  },
  {
    id: 'portfolio',
    label: 'Freelancer & Executive Portfolio',
    group: 'Professional Services',
    shortDesc: 'Personal branding, resume highlights, case studies, and direct advisory bookings.',
    iconName: 'User',
    itemTypeLabel: 'Work & Projects',
    defaultItems: [
      { name: 'Executive Strategy & Architectural Advisory', price: '৳5,000/hr', description: '1-on-1 technical advisory session for tech founders and business leaders.' },
      { name: 'Custom Full-Stack Web Development', price: 'Custom Quote', description: 'High-performance React/Node web application with Supabase backend.' },
    ],
    customFields: [
      { key: 'currentRole', label: 'Professional Title', type: 'text', placeholder: 'e.g. Principal Software Architect & Product Consultant', defaultValue: 'Senior Product Engineer & Growth Consultant' },
      { key: 'experienceYears', label: 'Years of Experience', type: 'text', placeholder: 'e.g. 8+ Years in SaaS & High-Growth Startups' },
    ],
    primaryCtaOptions: ['Book Consultation', 'WhatsApp Me', 'Download Resume'],
    secondaryCtaOptions: ['View Projects', 'Send Email'],
  },

  // --- Flexible Categories ---
  {
    id: 'other',
    label: 'Custom Business Website',
    group: 'Flexible Categories',
    shortDesc: 'Versatile layout adaptable for any commercial, non-profit, or specialty enterprise.',
    iconName: 'Globe',
    itemTypeLabel: 'Services / Offerings',
    defaultItems: [
      { name: 'Core Commercial Offering', price: 'Custom Quote', description: 'High-grade commercial service tailored to client requirements.' },
      { name: 'Ongoing Support & Maintenance', price: '৳1,500/mo', description: 'Dedicated technical oversight, updates, and customer support.' },
    ],
    customFields: [
      { key: 'customBusinessTagline', label: 'Business Tagline / Specialty', type: 'text', placeholder: 'e.g. Trusted Quality & Innovation Since 2018' },
    ],
    primaryCtaOptions: ['Contact Us', 'Inquire on WhatsApp', 'Request a Quote'],
    secondaryCtaOptions: ['Call Now', 'View Catalog'],
  },
];

export const THEME_PALETTES = [
  {
    id: 'pal-royal-blue',
    name: 'Executive Royal Blue',
    brandColor: '#2563EB',
    bgColor: '#FFFFFF',
    textColor: '#0F172A',
    accentColor: '#1E40AF',
    fontPairing: 'Plus Jakarta Sans',
  },
  {
    id: 'pal-emerald-growth',
    name: 'Artisan Emerald Green',
    brandColor: '#059669',
    bgColor: '#FAFAFA',
    textColor: '#064E3B',
    accentColor: '#047857',
    fontPairing: 'DM Sans',
  },
  {
    id: 'pal-warm-amber',
    name: 'Culinary Warm Amber',
    brandColor: '#D97706',
    bgColor: '#FFFBEB',
    textColor: '#78350F',
    accentColor: '#B45309',
    fontPairing: 'Plus Jakarta Sans',
  },
  {
    id: 'pal-luxury-purple',
    name: 'Boutique Velvet Purple',
    brandColor: '#7C3AED',
    bgColor: '#FAF5FF',
    textColor: '#4C1D95',
    accentColor: '#6D28D9',
    fontPairing: 'Outfit',
  },
  {
    id: 'pal-slate-carbon',
    name: 'Modern Slate & Carbon',
    brandColor: '#0F172A',
    bgColor: '#F8FAFC',
    textColor: '#0F172A',
    accentColor: '#334155',
    fontPairing: 'Manrope',
  },
  {
    id: 'pal-rose-glam',
    name: 'Salon & Spa Blush Rose',
    brandColor: '#E11D48',
    bgColor: '#FFF1F2',
    textColor: '#881337',
    accentColor: '#BE123C',
    fontPairing: 'Plus Jakarta Sans',
  },
];
