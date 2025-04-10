import { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, TextInput, View, ScrollView } from 'react-native';
import RecipeCards from './RecipeCard';
import { decode } from 'he';


export default function SearchCard(){
    const [search,setSearch] = useState("")
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const backendURL = "http://192.168.4.49:7000/search-recipies"
    const [currentPage, setCurrentPage] = useState(1);
    const recipesPerPage = 6;
    

    const fetchRecipies = async () => {
        console.log("loading")
        setLoading(true);
        try{
            const response = await fetch(backendURL,{
                method:"POST",
                headers: {
                    "Content-Type": "application/json"
                  },
                body: JSON.stringify({ search: search })
            })
            const data = await response.json()
            setResults(data.recipes);
            setCurrentPage(1);
        }catch(err){
            console.err(err);
        }finally{
            console.log("done loading")
            setLoading(false)
        }
    }

    const indexOfLastRecipe = currentPage * recipesPerPage;
    const indexOfFirstRecipe = indexOfLastRecipe - recipesPerPage;
    const currentRecipes = results.slice(indexOfFirstRecipe, indexOfLastRecipe);
    const totalPages = Math.ceil(results.length / recipesPerPage);

    return (
<ScrollView>
  <View style={styles.searchContainer}>
    <TextInput
      placeholder="Enter Recipe Name Here"
      style={styles.searchInput}
      onChangeText={(text) => setSearch(text)}
      value={search}
      returnKeyLabel="return"
      onSubmitEditing={fetchRecipies}
    />
  </View>

  <View style={styles.recipeContainer}>
    {currentRecipes.map((recipe, index) => (
      <RecipeCards key={index} recipe={recipe} />
    ))}
  </View>

  {results.length > 0 && (
    <View style={styles.paginationContainer}>
      <TouchableOpacity
        onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
        disabled={currentPage === 1}
        style={styles.pageButton}
      >
        <Text>Previous</Text>
      </TouchableOpacity>

      <Text style={{ marginHorizontal: 10 }}>
        Page {currentPage} / {totalPages}
      </Text>

      <TouchableOpacity
        onPress={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
        disabled={currentPage === totalPages}
        style={styles.pageButton}
      >
        <Text>Next</Text>
      </TouchableOpacity>
    </View>
  )}
</ScrollView>


    )
}
const screenWidth = Dimensions.get('window').width;
const screenHeight= Dimensions.get('window').height;

const styles = StyleSheet.create({
    searchContainer: {
      width: screenWidth,
      height: Math.max(60, screenHeight * 0.08),
      justifyContent: "center",
      alignItems: "center",
      marginTop: 10
    },
    searchInput: {
      height: "100%",
      width: "90%",
      backgroundColor: "white",
      borderRadius: 10,
      paddingLeft: 15,
      fontSize: 18,
    },
    paginationContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginVertical:30,
    },
    pageButton: {
      padding: 10,
      backgroundColor: "#eee",
      borderRadius: 5,
      marginHorizontal: 5,
    },
    recipeContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-evenly",
        marginTop:20, 

    },
  });

