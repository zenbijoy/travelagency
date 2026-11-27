import type { Metadata } from 'next';
import { getHotelById } from '../../../lib/api';

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const hotel = await getHotelById(id);
  if (!hotel) {
    return { title: 'Hotel unavailable | ShopnoJatra', robots: { index: false } };
  }

  return {
    title: `${hotel.name} | ShopnoJatra`,
    description: hotel.description || `View details for ${hotel.name} in ${hotel.city}.`,
    alternates: { canonical: `/hotels/${hotel.id}` },
    openGraph: {
      title: hotel.name,
      description: hotel.description || `View details for ${hotel.name} in ${hotel.city}.`,
      images: [{ url: hotel.heroImage, alt: hotel.name }],
      type: 'website',
    },
  };
}

export default function HotelDetailLayout({ children }: Props) {
  return children;
}
