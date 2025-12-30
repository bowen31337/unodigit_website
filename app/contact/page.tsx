import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Uno Digit. We are ready to help you transform your business with AI. Located in Sydney, Australia.',
  openGraph: {
    title: 'Contact Uno Digit | AI Consultancy Sydney',
    description: 'Get in touch with Uno Digit. We are ready to help you transform your business with AI.',
  },
};

export default function ContactPage() {
  return <ContactClient />;
}

