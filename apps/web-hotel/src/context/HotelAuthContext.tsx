import React, { createContext, useContext } from 'react';

export type HotelRole = 'hotel_admin' | 'hotel_staff' | 'front_desk' | 'housekeeper';

export interface HotelStaffUser {
  id: string;
  name: string;
  email: string;
  role: HotelRole;
  hotelId: string;
  hotelName: string;
  lastLogin: string;
}

interface HotelAuthContextType {
  user: HotelStaffUser | null;
  hotelId: string | null;
  isAuthenticated: boolean;
  login: (email: string, role: HotelRole, hotelId: string, hotelName: string) => void;
  logout: () => void;
}

const HotelAuthContext = createContext<HotelAuthContextType | undefined>(undefined);

/** Hotel access is blocked until a Supabase session can be verified through /auth/me. */
export const HotelAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HotelAuthContext.Provider value={{
    user: null,
    hotelId: null,
    isAuthenticated: false,
    login: () => undefined,
    logout: () => undefined,
  }}>
    {children}
  </HotelAuthContext.Provider>
);

export const useHotelAuth = () => {
  const context = useContext(HotelAuthContext);
  if (!context) throw new Error('useHotelAuth must be used within a HotelAuthProvider');
  return context;
};
