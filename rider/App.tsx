import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RiderNavigation } from "./src/navigation";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RiderNavigation />
    </SafeAreaProvider>
  );
}
