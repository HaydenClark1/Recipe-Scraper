import { BlurView } from "expo-blur";
import { View, Text, StyleSheet,Dimensions, TouchableOpacity } from 'react-native';
import { decode } from 'he';
import { ScrollView } from 'react-native-gesture-handler';
import { ActivityIndicator } from 'react-native';
import { useState,useEffect  } from "react";
import { Modal } from "react-native";



export default function InstructionsCard({recipeData,onClose,saveRecipe}){
    const backendURL = "https://recipe-scraper-hk6l.onrender.com";
    const [loading, setLoading] = useState(false);
    const [ingredients, setIngredients] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [ingredientModal, setIngredientModal] = useState(false);
    const [activeIngredient,setActiveIngredient] = useState("")

    useEffect(() =>{
        const fetchIngredientsIfNeeded  = async() =>{
            if (ingredients.length === 0) {
                await parseIngredients();
            } else {
                console.log("Ingredients already cached.");
            }
        }
        fetchIngredientsIfNeeded();

    },[])

    const parseIngredients = async() =>{
        console.log("current ingredients ", ingredients);

        if (ingredients.length > 0) {
            console.log("Ingredients already cached.");
            return; 
          }
        try{
          setLoading(true);
          const response = await fetch(`${backendURL}/parse-ingredients-api`,{
            method:"POST",
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ingredients:recipeData.ingredients}),
          });
          
          const data = await response.json();
          if (data){
            setIngredients(data)
            const stopWords = ['and', 'of', 'with', 'a', 'the', 'to', 'for', 'in', 'on', 'at', 'by', 'from'];

            const words = data
                .flatMap(ing => ing.name.toLowerCase().split(/\s+/))
                .map(word => word.replace(/[^a-z]/gi, ''))
                .filter(word => word && !stopWords.includes(word));
            
            console.log("🧠 Highlight keywords:", words);
            setKeywords(words);
          }
         
    
    
        }catch(error){
          console.log("error fetching data",error)
        }finally{
          setLoading(false);
        }
    
      }


    


    const highlightMatches = (text, keywords,onWordPress) => {
        let parts = [text];
      
        keywords.forEach((word) => {
            if (!word) return;

            const regex = new RegExp(`(${word})`, 'gi');
            
            parts = parts.flatMap((part) => {
                if (typeof part === 'string') {
                return part.split(regex).filter(Boolean).map((chunk) =>
                    regex.test(chunk) ? { highlight: true, text: chunk } : chunk
                );
                }
                return part;
            });
        });
      
        return parts.map((part, index) =>
          typeof part === 'string' ? (
            <Text key={index}>{part}</Text>
          ) : (
            <Text
            key={index}
            onPress={() => onWordPress(part.text)}
            style={[styles.bulletText, styles.highlight]}
          >
            {part.text}
          </Text>
          )
        );
      };
      

    return (
         <View style={styles.container}>
                    <BlurView intensity={80} tint="light" style={styles.glassCard}>
                        <Text style={styles.title}>{recipeData.title || "No Title Found"}</Text>
                        
                        <Text style={styles.sectionTitle}>Instructions</Text>
        
                        <ScrollView
                            style={styles.scrollContainer}
                            contentContainerStyle={{ paddingBottom: 40 }}
                        >   
                        {recipeData.instructions && recipeData.instructions.length > 0 ? (
                            recipeData.instructions.map((instruction, index) =>
                                typeof instruction === 'string' && instruction.trim().length > 0 ? (
                                    <Text key={index} style={styles.bullet}>
                                        {"\u2022"} {highlightMatches(decode(instruction), keywords, (word) => {
                                            setActiveIngredient(word);
                                            setIngredientModal(true);
                                            
                                        })}
                                    </Text>
                                
                                ) : null
                            )
                            ) : (
                            <Text style={{ textAlign: "center", fontSize: 25 }}>No instructions Found</Text>
                            )}

                        </ScrollView>
                      
                        

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                                <Text style={styles.btnText}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.saveBtn}
                                onPress={() => saveRecipe(recipeData)}
                            >
                            <Text style={styles.btnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
  
                       
                    </BlurView>
                    {loading && (
                        <Modal animationType="fade" transparent={true} visible={loading}>
                            <View style={styles.loadingOverlay}>
                            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill}>
                                <View style={styles.loadingBox}>
                                <ActivityIndicator size="large" color="#0000ff" />
                                <Text style={styles.loadingText}>Scraping recipe...</Text>
                                </View>
                            </BlurView>
                            </View>
                        </Modal>
                    )}

                    
        </View>
        
    )
}

const screenWidth = Dimensions.get('window').width;
const screenHeight= Dimensions.get('window').height;

const styles = StyleSheet.create({
    container: {
      flex: 1,
      width:screenWidth,
      height:screenHeight,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#a1c4fd',
    },
    scrollContainer: {
        maxHeight: Math.max(300,screenHeight*0.5), 
        width:Math.max(100,screenWidth*0.8),

        marginTop: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.25)', // soft fade
        borderRadius: 15,
        padding: 15,

        // Shadow for iOS
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.2,
        shadowRadius: 10,

        // Elevation for Android
        elevation: 8,
    },
    glassCard: {
        width: screenWidth,
        height: screenHeight,
        padding: 20,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
        justifyContent: 'center', 
        alignItems: 'center',         
      },
      
    title: {
    
        fontSize: 22,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 10,
    },
    content: {
      fontSize: 16,
      color: '#333',
    },
    sectionTitle: {
        fontWeight: 'bold',
        fontSize: 18,
        marginTop: 10,
        color: '#000',
    },
    bullet: {
        fontSize: 16,
        color: '#333',
        marginLeft: 10,
        marginVertical: 2,
        paddingTop:4,
    },
    closeBtn:{
        justifyContent:"center",
        alignContent:"center",
        backgroundColor:"#ff1f1f",
        width:screenWidth*0.45,
        height: Math.max(40,screenHeight*0.045),
        borderRadius:10,
        marginTop:30,
        marginRight:10,
    },
    saveBtn:{
        justifyContent:"center",
        width:screenWidth*0.45,
        height: Math.max(40,screenHeight*0.045),
        borderRadius:10,
        marginTop:30,
        backgroundColor: "#139115",
        

    },
    btnText:{
        textAlign:"center",
        color:"white"

    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 20,
      },
      loadingOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
      },
      modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        
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
      bulletText: {
        fontSize: 16,
        color: '#333',
      },
      
      highlight: {
        backgroundColor: 'yellow',
      },
      
      ingredientModalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        
      },
      
  });


