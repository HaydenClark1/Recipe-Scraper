import { View,Text,StyleSheet,Dimensions,Image, TouchableOpacity} from "react-native"
import { useNavigation } from '@react-navigation/native';

export default function RecipeCards({recipe}){
    const navigation = useNavigation();


    const getImageURL = (imageName) => {
        if (imageName.startsWith("https")){ // If its from a new recipe
          return imageName
        }else{
          recipe.Image_Name = `https://raw.githubusercontent.com/HaydenClark1/recipe-images/main/${imageName}.jpg`
          return `https://raw.githubusercontent.com/HaydenClark1/recipe-images/main/${imageName}.jpg`;
        }
    };
    const handlePress = () => {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'Home',
              params: { selectedRecipe: recipe },
            },
          ],
        });
      };
    

    
    return (
        <TouchableOpacity
            onPress={handlePress}
        >
            <View style={styles.cardContainer}>
                <View style={styles.headerContainer}>
                    <Text style={{textAlign:"center", fontWeight:"bold",paddingTop:10}}>{recipe.Title}</Text>
                    <Image 
                        source={{uri: getImageURL(recipe.Image_Name)}}
                        style={styles.image}
                    />
                </View>
            </View>
        </TouchableOpacity>
    )
}

const screenWidth = Dimensions.get('window').width;
const screenHeight= Dimensions.get('window').height;

const styles = StyleSheet.create({
    cardContainer: {
        width: Math.min(200, screenWidth * 0.4),
        height: Math.min(300, screenHeight * 0.3),
        backgroundColor: "#ededed",
        marginBottom: 20,
        borderRadius: 10,
      
        // Shadow for iOS
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      
        // Elevation for Android
        elevation: 4,
      },
      
    headerContainer:{

    },
    image: {
        width: "100%",
        height: "70%",
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        resizeMode: "cover",
        paddingTop:20
      },



})