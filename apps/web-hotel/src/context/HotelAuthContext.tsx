import React, { createContext, useContext, useState, useEffect } from 'react';

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

export const HotelAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<HotelStaffUser | null>(() => {
    const saved = localStorage.getItem('sj_hotel_staff_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('sj_hotel_staff_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sj_hotel_staff_user');
    }
  }, [user]);

  const login = (email: string, role: HotelRole, hotelId: string, hotelName: string) => {
    const staffUser: HotelStaffUser = {
      id: `hotel-usr-${Date.now()}`,
      name: email.split('@')[0].replace('.', ' ').toUpperCase(),
      email,
      role,
      hotelId,
      hotelName,
      lastLogin: new Date().toISOString(),
    };
    setUser(staffUser);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <HotelAuthContext.Provider
      value={{
        user,
        hotelId: user?.hotelId || null,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </HotelAuthContext.Provider>
  );
};

export const useHotelAuth = () => {
  const context = useContext(HotelAuthContext);
  if (!context) {
    throw new Error('useHotelAuth must be used within a HotelAuthProvider');
  }
  return context;
};
