# ornitho2eBird

This project simplifies the conversion process from ornitho data to eBird format.

## Key Simplifications

This fork streamlines the conversion by making the following assumptions:

1. **Single observer by default** - Assumes one observer per checklist
2. **Stationary protocol** - Uses stationary protocol if no track is available
3. **Automatic grouping** - Groups casual sightings into daily incidental checklists within 5km of each other

These simplifications allow you to convert ornitho data to eBird **without any additional user inputs**, making the process fully automated.
