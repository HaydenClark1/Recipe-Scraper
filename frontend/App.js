import Homescreen from "./components/Homescreen";
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SearchCard from "./components/Cards/SearchCard";

export default function App() {
  const Stack = createNativeStackNavigator();

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={Homescreen} />
        <Stack.Screen name="Search" component={SearchCard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
