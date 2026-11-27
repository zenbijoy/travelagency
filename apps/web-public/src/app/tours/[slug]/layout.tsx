import type { Metadata } from 'next';
import { getTourBySlug } from '../../../lib/api';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tour = await getTourBySlug(slug);
  if (!tour) {
    return { title: 'Itinerary unavailable | ShopnoJatra', robots: { index: false } };
  }

  return {
    title: `${tour.title} | ShopnoJatra`,
    description: tour.overview || tour.subtitle,
    alternates: { canonical: `/tours/${tour.slug}` },
    openGraph: {
      title: tour.title,
      description: tour.overview || tour.subtitle,
      images: [{ url: tour.heroImage, alt: tour.title }],
      type: 'article',
    },
  };
}

export default function TourDetailLayout({ children }: Props) {
  return children;
}
