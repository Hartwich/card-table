import type { LocalizedGameTextMap } from "@open-party-lab/game-core";
import { additionalSetupText } from "./additionalSetupText.js";

export const cardTableText = {
  "de": {
    "displayName": "Kartentisch",
    "description": "Gemeinsamer Spieltisch für zwölf Kartenspiele: Mau-Mau, Schwimmen, Stichwette, Zahlenreihe, Lügen, Schwarzer Peter, Fischen, Herzeln, Doppelkopf, Rommé, Symboljagd und freies Spiel.",
    "visual": {
      "eyebrow": "Karten"
    }
  },
  "en": {
    "displayName": "Card Table",
    "description": "One shared table for twelve card games: Mau Mau, Thirty-one, Trick Bets, Number Rows, Cheat, Old Maid, Go Fish, Hearts, Doppelkopf, Rummy, Symbol Hunt and Free Play.",
    "visual": {
      "eyebrow": "Cards"
    },
    "lobbySetup": {
      "title": "Card Table setup",
      "description": "Choose a ruleset, deck and starting hand. Most rulesets support up to 6 players, Symbol Hunt up to 16 and Doppelkopf exactly 4.",
      "fields": {
        "ruleset": {
          "label": "Ruleset",
          "options": {
            "mau-mau": {
              "label": "Mau Mau",
              "description": "Sevens draw two, eights skip, nines reverse and jacks choose a suit."
            },
            "schwimmen": {
              "label": "Thirty-one",
              "description": "Three cards in hand and three face-up cards to swap. Knock to finish; each player has three lives."
            },
            "stichwette": {
              "label": "Trick Bets",
              "description": "Bid exactly how many tricks you will take. An original deck with Crowns and Feathers; hands grow each round."
            },
            "zahlenreihe": {
              "label": "Number Rows",
              "description": "Build four suited rows from 1 to 20, each starting with eleven. Uses an original number deck."
            },
            "luegen": {
              "label": "Cheat",
              "description": "Play cards face down and claim the required rank. A failed challenge means taking the pile."
            },
            "schwarzer-peter": {
              "label": "Old Maid",
              "description": "Discard pairs and draw from your neighbour. The player left with the unpaired card loses."
            },
            "fischen": {
              "label": "Go Fish",
              "description": "Ask other players for a rank and collect four of a kind. Suitable for families."
            },
            "herzeln": {
              "label": "Hearts",
              "description": "Avoid tricks: each heart costs one point and the queen of spades costs thirteen."
            },
            "doppelkopf": {
              "label": "Doppelkopf",
              "description": "For four players: diamonds, queens, jacks and the ten of hearts are trumps. The club queens form the Re team."
            },
            "romme": {
              "label": "Rummy",
              "description": "Collect sets and runs, make an opening meld worth 40 points and empty your hand using jokers."
            },
            "symboljagd": {
              "label": "Symbol Hunt",
              "description": "Find the shared picture on your card and the centre card. Play solo against the clock or race other players. A wrong guess briefly locks you out."
            },
            "free-play": {
              "label": "Free Play",
              "description": "An open table with no enforced rules: any card may be played."
            }
          }
        },
        "symboljagdSymbolsPerCard": {
          "label": "Symbols per card",
          "description": "More pictures make the match harder to spot. Every pair of cards still shares exactly one symbol.",
          "options": {
            "8": {
              "label": "8 symbols · Standard",
              "description": "57 pictures and 57 cards."
            },
            "9": {
              "label": "9 symbols · Challenging",
              "description": "73 pictures and 73 cards."
            },
            "10": {
              "label": "10 symbols · Expert",
              "description": "91 pictures and 91 cards."
            }
          }
        },
        "symboljagdDealMode": {
          "label": "Card target",
          "options": {
            "all": {
              "label": "All cards",
              "description": "Deal the complete deck."
            },
            "fixed": {
              "label": "Fixed cards per player",
              "description": "Everyone plays toward the same target. Used cards are reshuffled when needed."
            }
          }
        },
        "symboljagdCardTarget": {
          "label": "Cards per player",
          "description": "Target for the fixed-card mode; All cards uses the complete deck."
        },
        "deck": {
          "label": "Card deck",
          "description": "Deck used by this ruleset.",
          "options": {
            "french-52": {
              "label": "French (52)",
              "description": "Spades, hearts, diamonds and clubs, from 2 to ace."
            },
            "french-54": {
              "label": "French + jokers (54)",
              "description": "The same deck plus two jokers."
            },
            "skat-32": {
              "label": "German (32)",
              "description": "Acorns, leaves, hearts and bells, from 7 to ace."
            },
            "party-40": {
              "label": "Party deck (40)",
              "description": "An original sample deck with its own symbols."
            },
            "french-104": {
              "label": "Double deck (108)",
              "description": "Two French decks and four jokers."
            }
          }
        },
        "handSize": {
          "label": "Starting hand",
          "description": "Cards dealt to each player."
        },
        "dimUnplayable": {
          "label": "Dim unplayable cards",
          "description": "Highlight playable cards on the phone. Turn off to show every card normally; the rules still apply."
        },
        "handSort": {
          "label": "Sort your hand",
          "description": "Group cards on the phone by trumps and suits instead of the order in which they were dealt."
        },
        "botCount": {
          "label": "AI players",
          "description": "Virtual players controlled by the table follow the same rules and fill up to six seats. Missing players are added automatically when a ruleset needs a minimum number."
        },
        "cardStyle": {
          "label": "Card artwork",
          "options": {
            "classic": {
              "label": "Classic",
              "description": "White cards with serif text, corner marks and suit pips."
            },
            "modern": {
              "label": "Modern",
              "description": "Coloured panels and large numbers, readable at a distance."
            },
            "clear": {
              "label": "Clear",
              "description": "Minimal artwork with a huge number and a small symbol."
            }
          }
        },
        "mauStackSevens": {
          "label": "Stack sevens",
          "description": "A seven passes the accumulated draw penalty to the next player.",
          "group": "Mau Mau house rules"
        },
        "mauSkipEights": {
          "label": "Eights skip",
          "description": "Playing an eight skips the next player.",
          "group": "Mau Mau house rules"
        },
        "mauReverseNines": {
          "label": "Nines reverse",
          "description": "A nine reverses play. With two players, it skips the other player.",
          "group": "Mau Mau house rules"
        },
        "mauJackOnJack": {
          "label": "Jack on jack",
          "description": "Jacks and jokers may also be played on other jacks or jokers.",
          "group": "Mau Mau house rules"
        },
        "mauPlayDrawn": {
          "label": "Play a drawn card immediately",
          "description": "After a normal draw, you may immediately play the drawn card. Penalty draws have a separate option.",
          "group": "Mau Mau house rules"
        },
        "mauPlayPenaltyDrawn": {
          "label": "Play after a penalty draw",
          "description": "After drawing a penalty, you may play a matching card from those just drawn. Previously held cards remain unavailable.",
          "group": "Mau Mau house rules"
        },
        "dokoNines": {
          "label": "Without nines (40 cards)",
          "description": "The king of diamonds becomes the lowest trump and rounds are shorter.",
          "group": "Doppelkopf house rules"
        },
        "dokoSecondDulle": {
          "label": "Second ten of hearts wins",
          "description": "If both tens of hearts enter one trick, the second one wins.",
          "group": "Doppelkopf house rules"
        },
        "dokoDoppelkopf": {
          "label": "Doppelkopf (40+ card points)",
          "description": "Award a bonus point for a trick worth at least 40 card points.",
          "group": "Doppelkopf house rules"
        },
        "dokoFox": {
          "label": "Catch the fox",
          "description": "Award a bonus point for capturing an opponent’s ace of diamonds.",
          "group": "Doppelkopf house rules"
        },
        "dokoCharlie": {
          "label": "Charlie in the last trick",
          "description": "Award a bonus point for the jack of clubs in the final trick.",
          "group": "Doppelkopf house rules"
        },
        "dokoFoxEnd": {
          "label": "Fox in the last trick",
          "description": "Award a bonus point for an ace of diamonds in the final trick.",
          "group": "Doppelkopf house rules"
        },
        "dokoPigs": {
          "label": "Super-trump aces",
          "description": "Holding both aces of diamonds makes them the highest trumps.",
          "group": "Doppelkopf house rules"
        },
        "dokoAgainstOld": {
          "label": "Against the queens",
          "description": "Award a bonus point when the Kontra team wins.",
          "group": "Doppelkopf house rules"
        },
        "dokoBock": {
          "label": "Double-score round",
          "description": "After a failed Re call or a team taking no tricks, the next round scores double.",
          "group": "Doppelkopf house rules"
        },
        "dokoForced": {
          "label": "Mandatory call at 35 card points",
          "description": "The winner of the first trick reveals their team.",
          "group": "Doppelkopf house rules"
        },
        "doppelkopfScoring": {
          "label": "Count card points only at the end",
          "description": "Hide the running totals; score the round after the last trick.",
          "group": "Doppelkopf house rules"
        }
      }
    }
  },
  "es": {
    "displayName": "Mesa de cartas", "description": "Una mesa compartida para doce juegos de cartas: Mau Mau, Treinta y uno, Corazones, Rummy y más.", "visual": { "eyebrow": "Cartas" },
    "lobbySetup": { "title": "Configuración de la mesa", "description": "Elige las reglas, la baraja y la mano inicial.", "fields": {
      "ruleset": { "label": "Juego", "options": {
        "mau-mau": { "label": "Mau Mau", "description": "Los sietes hacen robar dos, los ochos saltan turno, los nueves invierten el sentido y las jotas eligen palo." },
        "schwimmen": { "label": "Treinta y uno", "description": "Tres cartas en mano y tres descubiertas para intercambiar. Toca para terminar; tres vidas por jugador." },
        "stichwette": { "label": "Apuesta de bazas", "description": "Apuesta cuántas bazas ganarás. Las manos crecen en cada ronda." },
        "zahlenreihe": { "label": "Filas numéricas", "description": "Forma cuatro filas por palo del 1 al 20, empezando por el once." },
        "luegen": { "label": "Mentiroso", "description": "Juega cartas boca abajo y declara el valor requerido. Si te descubren, recoges el montón." },
        "schwarzer-peter": { "label": "La mona", "description": "Descarta parejas y roba al vecino. Pierde quien se quede con la carta sin pareja." },
        "fischen": { "label": "Pedir cartas", "description": "Pide un valor y reúne cuatro cartas iguales. Ideal para familias." },
        "herzeln": { "label": "Corazones", "description": "Evita las bazas: cada corazón vale un punto y la dama de picas, trece." },
        "doppelkopf": { "label": "Doppelkopf", "description": "Para cuatro: diamantes, damas, jotas y el diez de corazones son triunfos." },
        "romme": { "label": "Rummy", "description": "Reúne grupos y escaleras, abre con 40 puntos y vacía la mano con comodines." },
        "symboljagd": { "label": "Caza de símbolos", "description": "Encuentra la imagen común entre tu carta y la central. Un error te bloquea brevemente." },
        "free-play": { "label": "Juego libre", "description": "Mesa abierta sin reglas impuestas: puedes jugar cualquier carta." }
      } },
      ...additionalSetupText.es,
      "handSize": { "label": "Mano inicial", "description": "Cartas repartidas a cada jugador." }, "botCount": { "label": "Jugadores de IA", "description": "Los jugadores virtuales siguen las mismas reglas." },
      "symboljagdSymbolsPerCard": { "label": "Símbolos por carta", "description": "Más imágenes hacen que encontrar la coincidencia sea más difícil.", "options": { "8": { "label": "8 símbolos · Estándar", "description": "57 imágenes y 57 cartas." }, "9": { "label": "9 símbolos · Difícil", "description": "73 imágenes y 73 cartas." }, "10": { "label": "10 símbolos · Experto", "description": "91 imágenes y 91 cartas." } } },
      "symboljagdDealMode": { "label": "Objetivo de cartas", "options": { "all": { "label": "Todas las cartas", "description": "Reparte la baraja completa." }, "fixed": { "label": "Cantidad fija por jugador", "description": "Todos compiten por el mismo objetivo; las cartas usadas se mezclan de nuevo cuando hace falta." } } },
      "symboljagdCardTarget": { "label": "Cartas por jugador", "description": "Objetivo del modo de cantidad fija; Todas las cartas usa la baraja completa." },
      "cardStyle": { "label": "Diseño de cartas", "options": { "classic": { "label": "Clásico", "description": "Cartas blancas con texto serif, esquinas y símbolos de palo." }, "modern": { "label": "Moderno", "description": "Paneles de color y números grandes, visibles desde lejos." }, "clear": { "label": "Claro", "description": "Diseño minimalista: número grande y símbolo pequeño." } } }
    } }
  },
  "fr": {
    "displayName": "Table de cartes", "description": "Une table commune pour douze jeux de cartes : Mau Mau, Trente-et-un, Cœurs, Rami et bien d’autres.", "visual": { "eyebrow": "Cartes" },
    "lobbySetup": { "title": "Configuration de la table", "description": "Choisissez les règles, le paquet et la main de départ.", "fields": {
      "ruleset": { "label": "Jeu", "options": {
        "mau-mau": { "label": "Mau Mau", "description": "Les sept font piocher deux cartes, les huit passent le tour, les neuf inversent le sens et les valets choisissent une couleur." },
        "schwimmen": { "label": "Trente-et-un", "description": "Trois cartes en main et trois visibles à échanger. Frappez pour finir ; trois vies par joueur." },
        "stichwette": { "label": "Pari de plis", "description": "Misez sur le nombre de plis remportés. Les mains grandissent à chaque manche." },
        "zahlenreihe": { "label": "Rangées de nombres", "description": "Construisez quatre rangées par couleur de 1 à 20, en commençant par le onze." },
        "luegen": { "label": "Menteur", "description": "Jouez face cachée et annoncez la valeur requise. Un défi perdu fait ramasser le tas." },
        "schwarzer-peter": { "label": "Pouilleux", "description": "Défaussez les paires et piochez chez votre voisin. Le joueur avec la carte isolée perd." },
        "fischen": { "label": "Pioche !", "description": "Demandez une valeur et réunissez quatre cartes identiques. Adapté aux familles." },
        "herzeln": { "label": "Cœurs", "description": "Évitez les plis : chaque cœur vaut un point et la dame de pique en vaut treize." },
        "doppelkopf": { "label": "Doppelkopf", "description": "À quatre : carreaux, dames, valets et dix de cœur sont atouts." },
        "romme": { "label": "Rami", "description": "Formez des groupes et des suites, ouvrez avec 40 points et videz votre main avec des jokers." },
        "symboljagd": { "label": "Chasse aux symboles", "description": "Trouvez l’image commune à votre carte et à celle du centre. Une erreur vous bloque brièvement." },
        "free-play": { "label": "Jeu libre", "description": "Table ouverte sans règles imposées : toute carte peut être jouée." }
      } },
      ...additionalSetupText.fr,
      "handSize": { "label": "Main de départ", "description": "Cartes distribuées à chaque joueur." }, "botCount": { "label": "Joueurs IA", "description": "Les joueurs virtuels suivent les mêmes règles." },
      "symboljagdSymbolsPerCard": { "label": "Symboles par carte", "description": "Plus il y a d’images, plus la correspondance est difficile.", "options": { "8": { "label": "8 symboles · Standard", "description": "57 images et 57 cartes." }, "9": { "label": "9 symboles · Difficile", "description": "73 images et 73 cartes." }, "10": { "label": "10 symboles · Expert", "description": "91 images et 91 cartes." } } },
      "symboljagdDealMode": { "label": "Objectif de cartes", "options": { "all": { "label": "Toutes les cartes", "description": "Distribue le paquet complet." }, "fixed": { "label": "Nombre fixe par joueur", "description": "Tout le monde vise le même objectif ; les cartes utilisées sont mélangées à nouveau au besoin." } } },
      "symboljagdCardTarget": { "label": "Cartes par joueur", "description": "Objectif du mode fixe ; Toutes les cartes utilise le paquet complet." },
      "cardStyle": { "label": "Style des cartes", "options": { "classic": { "label": "Classique", "description": "Cartes blanches avec empattements, coins et symboles de couleur." }, "modern": { "label": "Moderne", "description": "Panneaux colorés et grands chiffres lisibles de loin." }, "clear": { "label": "Épuré", "description": "Visuel minimal : grand chiffre et petit symbole." } } }
    } }
  },
  "pt-BR": {
    "displayName": "Mesa de cartas", "description": "Uma mesa compartilhada para doze jogos de cartas: Mau Mau, Trinta e um, Copas, Rummy e muito mais.", "visual": { "eyebrow": "Cartas" },
    "lobbySetup": { "title": "Configuração da mesa", "description": "Escolha as regras, o baralho e a mão inicial.", "fields": {
      "ruleset": { "label": "Jogo", "options": {
        "mau-mau": { "label": "Mau Mau", "description": "Setes fazem comprar duas, oitos pulam, noves invertem a direção e valetes escolhem o naipe." },
        "schwimmen": { "label": "Trinta e um", "description": "Três cartas na mão e três abertas para trocar. Bata para encerrar; três vidas por jogador." },
        "stichwette": { "label": "Aposta de vazas", "description": "Aposte quantas vazas vai ganhar. As mãos aumentam a cada rodada." },
        "zahlenreihe": { "label": "Fileiras numéricas", "description": "Monte quatro fileiras por naipe de 1 a 20, começando pelo onze." },
        "luegen": { "label": "Blefe", "description": "Jogue cartas viradas para baixo e declare o valor exigido. Se o desafio falhar, recolha o monte." },
        "schwarzer-peter": { "label": "Mico", "description": "Descarte pares e compre do vizinho. Quem ficar com a carta sem par perde." },
        "fischen": { "label": "Pedir cartas", "description": "Peça um valor e reúna quatro iguais. Bom para famílias." },
        "herzeln": { "label": "Copas", "description": "Evite vazas: cada carta de copas vale um ponto e a dama de espadas vale treze." },
        "doppelkopf": { "label": "Doppelkopf", "description": "Para quatro: ouros, damas, valetes e o dez de copas são trunfos." },
        "romme": { "label": "Rummy", "description": "Monte grupos e sequências, abra com 40 pontos e esvazie a mão usando curingas." },
        "symboljagd": { "label": "Caça aos símbolos", "description": "Ache a imagem em comum entre sua carta e a do centro. Um erro bloqueia por um instante." },
        "free-play": { "label": "Jogo livre", "description": "Mesa aberta sem regras obrigatórias: qualquer carta pode ser jogada." }
      } },
      ...additionalSetupText["pt-BR"],
      "handSize": { "label": "Mão inicial", "description": "Cartas distribuídas para cada jogador." }, "botCount": { "label": "Jogadores de IA", "description": "Jogadores virtuais seguem as mesmas regras." },
      "symboljagdSymbolsPerCard": { "label": "Símbolos por carta", "description": "Mais imagens tornam a combinação mais difícil de encontrar.", "options": { "8": { "label": "8 símbolos · Padrão", "description": "57 imagens e 57 cartas." }, "9": { "label": "9 símbolos · Desafiador", "description": "73 imagens e 73 cartas." }, "10": { "label": "10 símbolos · Especialista", "description": "91 imagens e 91 cartas." } } },
      "symboljagdDealMode": { "label": "Meta de cartas", "options": { "all": { "label": "Todas as cartas", "description": "Distribui o baralho completo." }, "fixed": { "label": "Quantidade fixa por jogador", "description": "Todos jogam pela mesma meta; cartas usadas são embaralhadas de novo quando necessário." } } },
      "symboljagdCardTarget": { "label": "Cartas por jogador", "description": "Meta do modo fixo; Todas as cartas usa o baralho completo." },
      "cardStyle": { "label": "Estilo das cartas", "options": { "classic": { "label": "Clássico", "description": "Cartas brancas com serifa, cantos e símbolos dos naipes." }, "modern": { "label": "Moderno", "description": "Painéis coloridos e números grandes, fáceis de ler à distância." }, "clear": { "label": "Simples", "description": "Visual mínimo: número grande e símbolo pequeno." } } }
    } }
  }
} satisfies LocalizedGameTextMap;
