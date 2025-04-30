# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "geopandas>=1.0.1"
# ]
# ///


#Script permettant de compter les pings dans les polygones 
#Jeux de données nécessaires : pings et bâtiments 

#Import des bibliothèques

import geopandas as gpd
from pathlib import Path

#Définition des constantes

DATA_PATH = Path(__file__).parents[1] / "datas"

files = [
    "ping.geojson",
]

points = '/home/falgoust/Documents/citiprofile1/Données_Rennes/ping.geojson' #changer les variables pour les fichiers points qu'on souhaite
polygons = '/home/falgoust/Téléchargements/citiprofile/batis_compte60_61_w.geojson' #changer les variables pour les fichiers polygones qu'on souhaite

#Etape 1 : lire les fichiers en spécifiant l'encodage (latin-1) 
 
with open(points, 'r', encoding='latin-1' ) as file:
    points_gdf = gpd.read_file(file)

with open(polygons, 'r', encoding='latin-1') as file:
    polygons_gdf = gpd.read_file(file)

print(points_gdf)

#Etape 1b supprimer les colonnes en trop si il y a une colonne 'nbpoints'

if 'nbpoints' in polygons_gdf.columns:
    polygons_gdf = polygons_gdf.drop(columns=['nbpoints'])
else:
    print("il n'y a pas de colonnes nbpoints")

#Compter les pts dans les polygones 

polygons_gdf['compte_point'] = polygons_gdf.apply(lambda row: points_gdf.within(row.geometry).sum(), axis=1)
print('les points sont comptés !')

# Afficher le résultat
print(polygons_gdf[['geometry', 'compte_point']])

# Sauvegarder le résultat dans un nouveau fichier GeoJSON
polygons_gdf.to_file('points_ds_poly_ok.geojson', driver='GeoJSON')