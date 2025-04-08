import { StatusBar } from 'expo-status-bar';
import { Dimensions,Button, StyleSheet, Text,Image, TouchableOpacity, TextInput, View,ScrollView} from 'react-native';
import { Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { ImageBackground } from 'react-native';
import { useState } from 'react';
import Ingredients from './components/Ingredients';
import InstructionsCard from './components/InstructionsCard';
import Carousel from 'react-native-reanimated-carousel';
import ImageCard from './components/ImageCard';

export default function App() {
  const backendURL = "http://192.168.4.49:7000/scrape-recipe"
  const [URL,setURL] = useState("")
  const [recipeData,setRecipeData] = useState(null)
  const [modalVisible, setModalVisible] = useState(false);

  const scrapWebsite = async() =>{
    console.log("Captured URL:", URL);
    try{
      const response = await fetch(backendURL,{
        method:"POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({url:URL}),
      });
      
      const data = await response.json();
      if (data){
        setRecipeData(data)
        setModalVisible(true)
        console.log(data)
      }
     


    }catch(error){
      console.log("error fetching data",error)
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

        {recipeData && (

            <Modal
              animationType="slide"
              transparent={false}
              visible={modalVisible}
              onRequestClose={() => setModalVisible(false)}
            >
            <Carousel
              loop={false}
              width={screenWidth}
              height={screenHeight}
              autoPlay={false}
              data={[
                { id: 'image', type: 'image' },
                { id: 'ingredients', type: 'ingredients' },
                { id: 'instructions', type: 'instructions' },
              ]}
              scrollAnimationDuration={500}
              renderItem={({ item }) => {
                if (item.type === 'image') {
                  return(
                    <ImageCard 
                    recipeData={recipeData}
                    onClose={() => setModalVisible(false)}
                    />
                  )
                } else if (item.type === 'ingredients') {
                  return (
                    <Ingredients
                      recipeData={recipeData}
                      onClose={() => setModalVisible(false)}
                    />
                  );
                } else if (item.type === 'instructions') {
                  return (
                    <InstructionsCard
                      instructions={recipeData.instructions}
                      title={recipeData.title}
                      onClose={() => setModalVisible(false)}
                    />
                  );
                }
                return null;
              }}
            />
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                        <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
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
  
});

