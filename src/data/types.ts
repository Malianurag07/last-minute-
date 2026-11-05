import type { ColorName } from '../theme';

export type Role = 'customer' | 'provider';
export type Lang = 'en' | 'hi';

export interface Category {
  id: string;
  name: string;
  nameHi: string;
  icon: string; // Ionicons glyph name
  color: ColorName;
  soft: ColorName;
  /** Service templates offered to a provider during sign-up so they don't need to type. */
  templates: { name: string; price: number; minutes: number }[];
}

export interface Service {
  id: string;
  name: string;
  price: number; // INR
  minutes: number; // typical turnaround
}

export interface Review {
  id: string;
  author: string;
  rating: number; // 1..5
  text: string;
  date: string; // ISO
}

export interface Provider {
  id: string;
  name: string;
  age?: number;
  phone: string;
  categoryId: string;
  bio: string;
  area: string;
  distanceKm: number;
  /** "Rush" surcharge for jobs needed within 2 hours. */
  rushFee: number;
  services: Service[];
  rating: number;
  reviews: Review[];
  jobsDone: number;
  languages: string[];
  openFrom: string; // "09:00"
  openTo: string; // "21:00"
  available: boolean;
  /** Profile visits for the last 7 days, oldest first. */
  visits: number[];
  verified: boolean;
  joinedAt: string;
}

export type OrderStatus =
  | 'requested'
  | 'accepted'
  | 'pickup'
  | 'working'
  | 'ready'
  | 'delivered'
  | 'declined'
  | 'cancelled';

export interface DeliveryBooking {
  partnerId: string;
  partnerName: string;
  vehicle: string;
  price: number;
  etaMins: number;
  leg: 'pickup' | 'drop' | 'both';
}

export interface Order {
  id: string;
  providerId: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  price: number;
  rushFee: number;
  deliveryFee: number;
  /** ISO time the customer needs it by */
  needBy: string;
  createdAt: string;
  notes: string;
  handover: 'delivery' | 'self';
  address: string;
  delivery?: DeliveryBooking;
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  rating?: number;
  review?: string;
}

export type CollabStatus = 'pending' | 'accepted' | 'declined';

export interface Collaboration {
  id: string;
  fromProviderId: string;
  toProviderId: string;
  message: string;
  createdAt: string;
  status: CollabStatus;
}
