import { Dimensions,Alert, Button,StyleSheet, Text, TouchableOpacity, TextInput, View,ScrollView} from 'react-native';

export default function NutritionCard({recipeData,onClose,saveRecipe}){

   
      
    return (    
        <View>
            
            {recipeData.ingredients.map((ingredient,index)=>{
                return <Text key={index}>{ingredient}</Text>
            })
            }


        </View>
    )
}

const styles = StyleSheet.create({


})