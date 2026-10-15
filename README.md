# Airline operations database

A relational model for an airline's control system, written for Oracle 23ai: airports and their infrastructure, fleet and maintenance, daily flight operations, crew, bookings, baggage and operational events.

**Live schema explorer and ER diagram:** https://ferjoo.github.io/airline-database/

| | |
|---|---:|
| Tables | 29 |
| Foreign keys | 36 |
| Check constraints | 39 |
| Weak entities | 7 |

Designed as a two-person team.

## What the model covers

- **Airports & infrastructure:** airports by IATA code, terminals, gates and runways.
- **Fleet & maintenance:** fleets, aircraft models, aircraft, workshops, maintenance history and physical seats by cabin class.
- **Flights & segments:** airlines, commercial flights, the daily operation of each flight, its legs and seat inventory per leg and class.
- **Crew:** a crew-member supertype with pilot and cabin-crew subtypes, type ratings per aircraft model, and assignment history per leg and role.
- **Reservations & passengers:** passengers, bookings (PNR), the passengers on each booking, the itinerary legs and the connections between them.
- **Baggage:** checked pieces and claims for lost or damaged baggage.
- **Operations & alerts:** an append-only event log per leg (gate changes, actual times, delays) and irregularity alerts.

## Design decisions

**A flight is not an operation.** `VUELO` is the commercial flight number, which repeats every day. `OPERACION_VUELO` is identified by flight number + date and is a weak entity of `VUELO`; crew, aircraft, gates and delays belong to the operation, not to the flight number. `SEGMENTO` is in turn a weak entity of the operation, identified by its sequence number, which also preserves the order of the legs.

**Integrity is declarative wherever possible.** The segment's gate foreign keys include the airport code, so the database guarantees that the departure gate belongs to the origin airport and the arrival gate to the destination, without triggers.

**Disjoint specialization, enforced by keys.** `TRIPULANTE` is the supertype of `PILOTO` and `TRIPULANTE_CABINA`. The supertype declares `UNIQUE (ID_TRIPULANTE, TIPO)`, each subtype references that pair and fixes its own type with a `CHECK`, so a cabin-crew member can never be registered as a pilot.

**Associative entities.** Many-to-many relationships and multivalued attributes become entities with their own attributes: `CALIFICACION` (type ratings with obtained/expiry dates), `ASIGNACION_TRIPULACION` (the role is an attribute of the assignment, since the same person can be captain on one leg and first officer on another), `RESERVA_PASAJERO`, `RESERVA_SEGMENTO` (class, seat and whether the leg is the final destination) and `CONEXION`.

**Domain rules as CHECK constraints.** 39 checks cover enumerations (gate types, cabin classes, operation states, crew roles), ranges (positive lengths, weights and durations; occupied seats between 0 and total), date ordering (maintenance end after start, arrival after departure) and structural rules such as origin ≠ destination and connections only between consecutive itinerary positions.

**Derived values are virtual columns.** Departure delay in minutes, available seats and the missed-connection flag are `GENERATED ALWAYS AS … VIRTUAL`, so they are always consistent with the stored facts.

**Composite natural keys vs. surrogate keys.** The model uses composite natural keys so the diagram shows the identity dependencies of the entity-relationship model (weak entities inherit their owner's key). In a production system it would be reasonable to switch the deepest chains (`SEGMENTO`, `RESERVA_SEGMENTO`) to surrogate keys and keep the natural key as a `UNIQUE` constraint, trading a clearer conceptual model for narrower foreign keys and simpler joins.

## Files

```
schema/airline.sql   DDL: 29 tables with keys, checks, virtual columns and table comments
index.html           Schema explorer and ER diagram (parses the DDL in the browser)
assets/              Explorer script and styles
```

## Import into Oracle SQL Data Modeler

1. `File → Import → DDL File`
2. Select `schema/airline.sql`
3. Source: **Oracle Database 12c or later**
4. The import log should report **29 tables**
5. Right-click `Relational_1` → **Engineer to Logical Model** to get the entity-relationship diagram

The script also runs directly on Oracle 23ai. It has no anonymous PL/SQL blocks or `CREATE INDEX` statements, because the Data Modeler DDL parser can stop on them.
