import { Dimensions,Alert, Button,StyleSheet, Text, TouchableOpacity, TextInput, View,ScrollView} from 'react-native';
import { Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { ImageBackground } from 'react-native';
import { useState,useEffect,useCallback } from 'react';
import Ingredients from './Cards/Ingredients';
import InstructionsCard from './Cards/InstructionsCard';
import Carousel from 'react-native-reanimated-carousel';
import ImageCard from './Cards/ImageCard';
import PaginationDots from './PaginationDots'
import { useRoute, useFocusEffect } from '@react-navigation/native';
import NutritionCard from './Cards/NutritionCard';
import { ActivityIndicator } from 'react-native';


export default function Homescreen({navigation}){


  //const backendURL = "http://192.168.4.49:7000"
  const backendURL = "https://recipe-scraper-hk6l.onrender.com";
  const [URL,setURL] = useState("")
  const [recipeData,setRecipeData] = useState(null)
  const [modalVisible, setModalVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [carouselKey, setCarouselKey] = useState(0);
  const route = useRoute();
  const [loading, setLoading] = useState(false);


  useFocusEffect(
    useCallback(() => {
      if (route.params?.selectedRecipe) {
        
        const selectedRecipe = route.params.selectedRecipe;
       
        if (!recipeData || recipeData.title !== selectedRecipe.Title) {
          const newRecipe = {
            title: selectedRecipe.Title,
            ingredients: typeof selectedRecipe.Cleaned_Ingredients === 'string'
              ? selectedRecipe.Cleaned_Ingredients.replace(/^\[|\]$/g, '')
                  .split(',')
                  .map(item => item?.trim())
                  .filter(item => item && item.length > 0)
              : [],
              instructions: selectedRecipe.Instructions ?
                  selectedRecipe.Instructions
                    .split('.')
                    .map(item => item?.trim())
                    .filter(item => item && item.length > 0)
                : [],
            
            image: selectedRecipe?.Image_Name || '',
          };
          
          setRecipeData(newRecipe);
          setModalVisible(true); 
        }
        
      }
    }, [route.params?.selectedRecipe])
  );

  


  const scrapWebsite = async() =>{
    try{
      setLoading(true);
      const response = await fetch(`${backendURL}/scrape-recipe`,{
        method:"POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({url:URL}),
      });
      
      const data = await response.json();
      if (data){
        console.log("SCRAPED DATA: ", data)
        setRecipeData(data)
        setModalVisible(true)
      }
     


    }catch(error){
      console.log("error fetching data",error)
    }finally{
      setLoading(false);
    }

  }

  const closeModal =() =>{
    setModalVisible(false)
    setCarouselKey(prev => prev + 1); 

  }
  const saveRecipe = async (recipe) =>{
    try{
      const response = await fetch(`${backendURL}/save-recipe`, {
          method:"POST",
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({recipe: recipe})

      })

      if (!response.ok){

        const errorData = await response.json();

        Alert.alert("Opps!",errorData.message);

        return
      }else{
        const data = await response.json();
        setModalVisible((prev) => !prev)
      }
    }catch (err){
      console.log("ERROR trying to save recipe")
    }
  }


  return (
    <ImageBackground
      source={{ uri: 'https://img.freepik.com/premium-vector/blue-white-minimal-background-with-line-abstract-geometric-futuristic-tech-background_131186-1823.jpg' }}
      style={styles.container}
      resizeMode="cover"
    >
        <BlurView intensity={1000} tint="light" style={[styles.header,{opacity:0.5}]}>
          <Text style={styles.welcome}>Recipe Web Scrapper</Text>
        </BlurView>
        <TextInput 
          placeholder='Enter URL'
          style={styles.input}
          onChangeText={(text)=>setURL(text)}
          defaultValue={URL}
        ></TextInput>
        <TouchableOpacity onPress={scrapWebsite} style={styles.submitBtn}>
        <Text style={styles.btnText}>
          Submit
        </Text>
          
        
        </TouchableOpacity>

        <View>
          <Button 
            title='Or Search from Database'
            style={styles.searchBtn}
            onPress={() => navigation.navigate('Search')}
          ></Button>
        </View>



        {recipeData && (

            <Modal
            animationType="slide"
            transparent={false}
            visible={modalVisible}
            onRequestClose={closeModal}
            >
            <View style={styles.modalContainer}>
              <Carousel
                defaultIndex={0}
                loop={false}
                width={screenWidth}
                height={screenHeight * 0.8}
                autoPlay={false}
                onSnapToItem={(index) => setCurrentIndex(index)}
                data={[
                  { id: 'image', type: 'image' },
                  { id: 'ingredients', type: 'ingredients' },
                  { id: 'instructions', type: 'instructions' },
                  //{ id: 'nutrition', type: 'nutrition'}
                ]}
                scrollAnimationDuration={400}
                renderItem={({ item }) => {
                  if (item.type === 'image') {
                    return (
                      <ImageCard
                        recipeData={recipeData}
                        onClose={() => setModalVisible(false)}
                        saveRecipe={saveRecipe}
                      />
                    );
                  } else if (item.type === 'ingredients') {
                    return (
                      <Ingredients
                        recipeData={recipeData}
                        onClose={() => setModalVisible(false)}
                        saveRecipe={saveRecipe}
                      />
                    );
                  } else if (item.type === 'instructions') {
                    return (
                      <InstructionsCard
                        recipeData={recipeData}
                        onClose={() => setModalVisible(false)}
                        saveRecipe={saveRecipe}
                      />
                    );
                  } 
                  /*else if (item.type === 'nutrition') {
                    return (
                      <NutritionCard
                        recipeData={recipeData}
                        onClose={() => setModalVisible(false)}
                        saveRecipe={saveRecipe}
                      />
                    );
                  }*/
                  return null;
                }}
              />

              <PaginationDots key = {carouselKey}currentIndex={currentIndex} total={3} />

             
            </View>
            </Modal>


        )}


        {loading && (
          <Modal
            animationType="fade"
            transparent={true}
            visible={loading}
          >
            <BlurView intensity={80} tint="light" style={styles.loadingOverlay}>
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#0000ff" />
                <Text style={styles.loadingText}>Scraping recipe...</Text>
              </View>
            </BlurView>
          </Modal>
        )}


      
    </ImageBackground>


  );
}

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get("window").height;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  header: {
    height: Math.min(80, screenHeight * 0.1),
    width: screenWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 70,
    borderRadius: 20,
  },
  welcome: {
    fontSize: Math.min(screenWidth * 0.1, 25),
    color: "#000",
    fontWeight: "bold"
  },
  input:{
    width:Math.min(screenWidth*0.8,350),
    height:Math.min(screenHeight*0.1,50),
    backgroundColor:"white",
    textAlign:"center",
  },
  submitBtn:{
    display:"flex",
    flexDirection:"column",
    justifyContent:"center",
    alignContent:"center",
    width:Math.min(screenWidth*0.5,300),
    height:Math.min(screenHeight *0.1,30),
    backgroundColor:"white",
    marginTop:10,
  },
  btnText:{
    textAlign:"center",

  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },

  loadingBox: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
  },
  
 
  
});

