# Faune-France taxa without a close eBird mapping

Based on the saved October 2026 Faune-France bird list and the eBird 2026 taxonomy. The current code is the ID mapping in the app; a blank ID mapping can still trigger a scientific-name fallback during import. Broader mappings intentionally lose detail. Subspecies-only records are excluded; hybrids between forms are included.

| Biolovision ID | Biolovision English name | Biolovision scientific name | Current eBird code | Current eBird English name | Current eBird scientific name | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 1502 | Whooper / Bewick's Swan | Cygnus cygnus / columbianus bewickii | swan1 | swan sp. | Cygnus sp. | Broader: all swans; the source specifies Whooper or Bewick’s. |
| 1631 | Hybrid Greylag Goose x ? | Anser anser x ? | goose1 | goose sp. | Anatidae (goose sp.) | Broader: goose sp.; hybrid and parent are lost. |
| 1628 | Hybrid Canada Goose x ? | Branta canadensis x ? | goose1 | goose sp. | Anatidae (goose sp.) | Broader: goose sp.; hybrid and parent are lost. |
| 1629 | Hybrid Barnacle Goose x ? | Branta leucopsis x ? | goose1 | goose sp. | Anatidae (goose sp.) | Broader: goose sp.; hybrid and parent are lost. |
| 1630 | Goose hybrid, unidentified | Anser / Branta hybrid | goose1 | goose sp. | Anatidae (goose sp.) | Broader: goose sp.; hybrid status is lost. |
| 1596 | Goose (Anser / Branta), unidentified | Anser / Branta sp. | anser1 | Anser sp. | Anser sp. | Too narrow: Anser sp. excludes Branta. |
| 125 | Duck hybrid, unidentified | Anatidae sp. x Anatidae sp. | duck1 | duck sp. | Anatidae (duck sp.) | Broader: duck sp.; hybrid status is lost. |
| 47585 | Hybrid Common Pochard x Greater Scaup | Aythya ferina x marila | aythya1 | Aythya sp. | Aythya sp. | Broader: Aythya sp.; hybrid and parent species are lost. |
| 62832 | Hybrid Ferruginous Duck x Eurasian Teal | Aythya nyroca x Anas crecca | waterf1 | waterfowl sp. | Anatidae sp. | Broader: waterfowl sp.; hybrid and parent species are lost. |
| 1602 | Tufted Duck / Greater Scaup | Aythya fuligula / marila | aythya1 | Aythya sp. | Aythya sp. | Broader: all Aythya; source specifies two species. |
| 15216 | Hybrid Aythya, unidentified | Aythya sp x Aythya sp. | aythya1 | Aythya sp. | Aythya sp. | Broader: Aythya sp.; hybrid status is lost. |
| 1603 | Common / Velvet Scoter | Melanitta nigra / fusca | scoter | scoter sp. | Melanitta sp. | Broader: all scoters; source specifies two species. |
| 1643 | Partridge, unidentified | Perdix / Alectoris sp. |  |  |  | No ID mapping for the two genera. |
| 1591 | Red-throated / Black-throated Loon | Gavia stellata / arctica | loon | loon sp. | Gavia sp. | Broader: all loons; source specifies two species. |
| 1507 | Fea's Petrel | Pterodroma feae | feapet1 | Cape Verde/Desertas Petrel | Pterodroma feae/deserta | eBird groups Cape Verde and Desertas Petrels; check whether this matches the source concept. |
| 1510 | Calonectris- / Great Shearwater | Calonectris sp. / Ardenna gravis | shearw | shearwater sp. | Procellariidae sp. (shearwater sp.) | Broader: shearwater sp.; source specifies Calonectris or Great Shearwater. |
| 47595 | Yelkouan / Balearic / Manx Shearwater | Puffinus yelkouan / mauretanicus / puffinus | bawshe1 | small shearwater sp. | Puffinus sp. | Broader: Puffinus sp.; source specifies three species. |
| 47596 | Yelkouan / Manx Shearwater | Puffinus yelkouan / puffinus | bawshe1 | small shearwater sp. | Puffinus sp. | Broader: Puffinus sp.; source specifies two species. |
| 62589 | Monteiro / Grant’s / Madeiran Storm Petrel | Hydrobates monteiro / granti / castro | oceano2 | Hydrobates sp. (Band-rumped complex) | Hydrobates sp. (Band-rumped complex) | Band-rumped complex; may include more forms than the three listed. |
| 15269 | European / Leach's Storm Petrel | Hydrobates pelagicus / leucorhous | oceano1 | Hydrobates sp. | Hydrobates sp. | Broader: Hydrobates sp.; source specifies two species. |
| 1190 | Honey / Common Buzzard | Pernis apivorus / Buteo buteo | hawk | hawk sp. | Accipitridae sp. (hawk sp.) | Broader: Accipitridae; source specifies two species. |
| 38791 | Greater / Hybrid Lesser x Greater Spotted Eagle | Clanga clanga / pomarina x clanga |  |  |  | No ID mapping for species-or-hybrid combination. |
| 1538 | Lanner / Saker Falcon | Falco biarmicus / cherrug |  |  |  | No ID mapping; check whether eBird has an exact group. |
| 1037 | Greater / Siberian Sand Plover | Anarhynchus leschenaultii / mongolus | y00648 | sand-plover sp. | Anarhynchus mongolus/atrifrons/leschenaultii | Broader: sand-plover group also includes Tibetan Sand-Plover. |
| 1033 | Willet | Tringa semipalmata | willet1 | Saltmarsh/Prairie Willet | Tringa semipalmata/inornata | eBird groups Saltmarsh and Prairie Willets; check whether this matches the source concept. |
| 1224 | Snipe, unidentified | Gallinago / Lymnocryptes sp. | snipe2 | snipe sp. | Gallinago sp. | Too narrow: Gallinago sp. excludes Jack Snipe (Lymnocryptes). |
| 19591 | Gull hybrid, unidentified | Laridae sp. X Laridae sp. | y00728 | gull/tern sp. | Laridae sp. | Broader: Laridae sp.; hybrid status is lost. |
| 1541 | Elegant / Lesser Crested Tern or hybrid | Thalasseus elegans / bengalensis / elegans x bengalensis | tern1 | tern sp. | Sterninae sp. | Broader: tern sp.; source specifies two species or their hybrid. |
| 54602 | Hybrid Black x White-winged Tern | Chlidonias niger x leucopterus | chlido1 | Chlidonias sp. | Chlidonias sp. | Broader: Chlidonias sp.; hybrid and parent species are lost. |
| 1266 | Common Murre / Razorbill | Uria aalge / Alca torda | laralc1 | large alcid sp. | Alca/Uria sp. | Broader: Alca/Uria sp.; source specifies two species. |
| 15194 | Dove sp. | Streptopelia / Spilopelia / Zenaida sp. |  |  |  | No ID mapping for the three genera. |
| 392 | Red-flanked Bluetail | Tarsiger cyanurus | refblu | Red-flanked/Qilian Bluetail | Tarsiger cyanurus/albocoeruleus | eBird groups Red-flanked and Western Himalayan Bluetails; check whether this matches the source concept. |
| 38813 | Aratinga/Psittacara/Eupsittula/Thectocercus sp. | Aratinga / Psittacara / Eupsittula / Thectocercus sp. |  |  |  | No ID mapping for the four genera. |
| 19482 | Hybrid Shrike, unidentified | Lanius sp. x Lanius sp. | shrike | shrike sp. | Laniidae sp. | Broader: Laniidae sp.; hybrid status and genus are lost. |
| 1638 | Fringillidae x Fringillidae sp. |  | finch1 | finch sp. | Fringillidae sp. | Broader: Fringillidae sp.; hybrid status is lost. |
| 13065 | Great / South Polar Skua | Stercorarius skua / maccormicki | skua | skua sp. | Stercorarius sp. (skua sp.) | Broader: skua sp.; source specifies two species. |
