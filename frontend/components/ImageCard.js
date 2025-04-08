import { BlurView } from "expo-blur"
import { View, Text,Image, StyleSheet,Dimensions,ScrollView, TouchableOpacity } from 'react-native';


export default function ImageCard({recipeData,onClose }){
const screenWidth = Dimensions.get('window').width;



    return(   
        <View style={styles.container}>
            <BlurView intensity={80} tint="light" style={styles.glassCard}>
                <Text style={styles.title}>{recipeData.title || "No Title Found"}</Text>
                
                <Image
                source={{ uri: recipeData.image }}
                style={{ width: screenWidth * 0.8, height: screenHeight * 0.5, borderRadius: 20 }}
                resizeMode="cover"
                />
                    
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.btnText}>Close</Text>
                </TouchableOpacity>
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
    scrollContainer: {
        maxHeight: Math.max(300,screenHeight*0.6), 
        width:Math.max(100,screenWidth*0.8),

        marginTop: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.25)', // soft fade
        borderRadius: 15,
        padding: 15,

        // 🌫 Shadow for iOS
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.2,
        shadowRadius: 10,

        // 🌀 Elevation for Android
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
        display:"flex",
        flexDirection:"column",
        justifyContent:"center",
        alignContent:"center",
        position:"absolute",
        bottom: 100,
        backgroundColor:"white",
        width:screenWidth*0.7,
        height: Math.max(40,screenHeight*0.045),
        borderRadius:10,
        marginTop:30,
    },
    btnText:{
        textAlign:"center",

    }
  });


