import { BlurView } from "expo-blur"
import { View, Text,Image, StyleSheet,Dimensions,ScrollView, TouchableOpacity } from 'react-native';


export default function ImageCard({recipeData,onClose,saveRecipe}){
const screenWidth = Dimensions.get('window').width;



    return(   
        <View style={styles.container}>
            <BlurView intensity={80} tint="light" style={styles.glassCard}>
                <Text style={styles.title}>{recipeData.title || "No Title Found"}</Text>
                
                <View style={styles.imageContainer}>
                    <Image
                        source={{ uri: recipeData.image }}
                        style={styles.image}
                        resizeMode="cover"
                    />
                </View>

                
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
      </View>
    );
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
        paddingTop: 20,

      },
    imageContainer:{
      maxHeight: Math.max(300, screenHeight * 0.5),
      width: Math.max(100, screenWidth * 0.8),
      marginTop: 10,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      borderRadius: 15,
      padding: 5,
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
    },
      
  });


