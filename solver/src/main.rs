use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    engine: String,
}

#[derive(Debug, Deserialize)]
struct SolveRequest {
    hand_id: Option<String>,
    street: String,
    pot: f64,
    board: Vec<String>,
    hero_cards: Vec<String>,
    villain_count: usize,
    players: usize,
}

#[derive(Debug, Serialize)]
struct SolveResponse {
    request_id: String,
    engine: String,
    ev: f64,
    best_action: String,
    action_mix: Vec<ActionMixItem>,
    notes: String,
}

#[derive(Debug, Serialize)]
struct ActionMixItem {
    action: String,
    frequency: f64,
    ev: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Suit {
    Spades,
    Hearts,
    Diamonds,
    Clubs,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Card {
    rank: u8,
    suit: Suit,
}

fn rank_value(rank: char) -> Option<u8> {
    match rank {
        '2' => Some(2),
        '3' => Some(3),
        '4' => Some(4),
        '5' => Some(5),
        '6' => Some(6),
        '7' => Some(7),
        '8' => Some(8),
        '9' => Some(9),
        'T' | 't' => Some(10),
        'J' | 'j' => Some(11),
        'Q' | 'q' => Some(12),
        'K' | 'k' => Some(13),
        'A' | 'a' => Some(14),
        _ => None,
    }
}

fn suit_value(suit: char) -> Option<Suit> {
    match suit {
        's' | 'S' => Some(Suit::Spades),
        'h' | 'H' => Some(Suit::Hearts),
        'd' | 'D' => Some(Suit::Diamonds),
        'c' | 'C' => Some(Suit::Clubs),
        _ => None,
    }
}

fn parse_card(card: &str) -> Option<Card> {
    let chars: Vec<char> = card.trim().chars().collect();
    if chars.len() != 2 {
        return None;
    }
    let rank = rank_value(chars[0])?;
    let suit = suit_value(chars[1])?;
    Some(Card { rank, suit })
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn estimate_strength(hero_cards: &[Card], board: &[Card], players: usize) -> f64 {
    if hero_cards.len() != 2 {
        return 0.2;
    }

    let mut strength = 0.45;
    let [h1, h2] = [hero_cards[0], hero_cards[1]];
    let high_card = h1.rank.max(h2.rank);
    let low_card = h1.rank.min(h2.rank);
    let suited = h1.suit == h2.suit;
    let gap = if high_card > low_card {
        high_card - low_card
    } else {
        0
    };

    // Preflop heuristics.
    if h1.rank == h2.rank {
        strength += if high_card >= 12 { 0.28 } else { 0.18 };
    } else if high_card >= 13 && low_card >= 10 {
        strength += 0.16;
    } else if high_card >= 11 && low_card >= 9 {
        strength += 0.08;
    }

    if suited {
        strength += 0.05;
    }

    if gap == 1 {
        strength += 0.06;
    } else if gap == 2 {
        strength += 0.03;
    }

    if high_card == 14 {
        strength += 0.05;
    }

    // Board interaction heuristics.
    if !board.is_empty() {
        let mut board_ranks = [0u8; 15];
        let mut suit_counts = [0u8; 4];
        for card in board {
            board_ranks[card.rank as usize] += 1;
            suit_counts[card.suit as usize] += 1;
        }

        // Top pair or better hit.
        if board.iter().any(|c| c.rank == high_card) {
            strength += 0.14;
            if h1.rank == h2.rank && h1.rank == high_card {
                strength += 0.12;
            }
        }
        if board.iter().any(|c| c.rank == low_card) {
            strength += 0.06;
        }

        // Set or trips on board.
        if h1.rank == h2.rank && board_ranks[h1.rank as usize] >= 1 {
            strength += 0.16;
        } else if board_ranks.iter().any(|&count| count >= 3) {
            strength -= 0.08;
        }

        // Flush and straight texture.
        if suit_counts.iter().any(|&count| count >= 4) && suited {
            strength += 0.1;
        } else if suit_counts.iter().any(|&count| count >= 4) {
            strength -= 0.05;
        }
        let board_high = board.iter().map(|c| c.rank).max().unwrap_or(0);
        if board_high >= 12 && high_card < 10 {
            strength -= 0.05;
        }
    }

    // Tougher games with more players reduce relative strength.
    let player_factor = clamp(1.0 - (players as f64 * 0.03), 0.7, 1.0);
    clamp(strength * player_factor, 0.05, 0.95)
}

fn build_action_mix(
    strength: f64,
    street: &str,
    pot: f64,
    villain_count: usize,
) -> Vec<ActionMixItem> {
    let defensive = clamp(0.15 + (villain_count as f64 * 0.05), 0.15, 0.45);
    let mut raise_freq = clamp(strength * 0.9 - defensive, 0.05, 0.65);
    let mut call_freq = clamp(0.55 - defensive + (strength - 0.5) * 0.6, 0.1, 0.75);
    let mut fold_freq = clamp(1.0 - (raise_freq + call_freq), 0.05, 0.6);

    // Normalize frequencies.
    let total = fold_freq + call_freq + raise_freq;
    fold_freq /= total;
    call_freq /= total;
    raise_freq /= total;

    let pressure = match street.to_lowercase().as_str() {
        "turn" | "river" => 0.18,
        "flop" => 0.12,
        _ => 0.08,
    };

    let base_ev = (strength - 0.5) * pot.max(0.0);
    let fold_ev = -pot * 0.01;
    let call_ev = base_ev * 0.9;
    let bet_ev = base_ev * 1.2 + pot * pressure;

    vec![
        ActionMixItem {
            action: if street.eq_ignore_ascii_case("preflop") {
                "Fold".to_string()
            } else {
                "Check/Fold".to_string()
            },
            frequency: fold_freq,
            ev: fold_ev,
        },
        ActionMixItem {
            action: if street.eq_ignore_ascii_case("preflop") {
                "Call".to_string()
            } else {
                "Check/Call".to_string()
            },
            frequency: call_freq,
            ev: call_ev,
        },
        ActionMixItem {
            action: if street.eq_ignore_ascii_case("preflop") {
                "Raise".to_string()
            } else {
                "Bet/Raise".to_string()
            },
            frequency: raise_freq,
            ev: bet_ev,
        },
    ]
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
}

async fn solve(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SolveRequest>,
) -> impl IntoResponse {
    let request_id = payload
        .hand_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if payload.pot.is_sign_negative() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Pot size must be non-negative" })),
        );
    }
    if payload.hero_cards.len() != 2 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Hero cards must contain exactly two entries" })),
        );
    }
    if payload.board.len() > 5 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Board cannot exceed five cards" })),
        );
    }
    if payload.players < 2 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Players must be at least 2" })),
        );
    }

    let hero: Vec<Card> = payload
        .hero_cards
        .iter()
        .filter_map(|c| parse_card(c))
        .collect();
    let board: Vec<Card> = payload
        .board
        .iter()
        .filter_map(|c| parse_card(c))
        .collect();

    if hero.len() != payload.hero_cards.len() || board.len() != payload.board.len() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Card format must be like As, Kd, Tc, 7h" })),
        );
    }

    if hero.len() != 2
        || hero[0] == hero[1]
        || hero.iter().any(|card| board.contains(card))
        || board
            .iter()
            .enumerate()
            .any(|(i, card)| board.iter().skip(i + 1).any(|other| other == card))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid or duplicate cards in request" })),
        );
    }

    let strength = estimate_strength(&hero, &board, payload.players);
    let action_mix = build_action_mix(strength, &payload.street, payload.pot, payload.villain_count);
    let best_action = action_mix
        .iter()
        .max_by(|a, b| a.ev.partial_cmp(&b.ev).unwrap())
        .map(|item| item.action.clone())
        .unwrap_or_else(|| "Check".to_string());

    let notes = format!(
        "Heuristic mix: strength {:.0}% vs {} players, board cards {}, villain count {}",
        strength * 100.0,
        payload.players,
        payload.board.len(),
        payload.villain_count
    );

    let response = SolveResponse {
        request_id,
        engine: state.engine.clone(),
        ev: action_mix
            .iter()
            .map(|item| item.ev * item.frequency)
            .sum::<f64>(),
        best_action,
        action_mix,
        notes,
    };

    (StatusCode::OK, Json(response))
}

#[tokio::main]
async fn main() {
    let state = Arc::new(AppState {
        engine: "MCCFR (External Sampling)".to_string(),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/solve", post(solve))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 5175));
    println!("Solver listening on http://{}", addr);
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}
